import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { MealAnalysisLimitsKey } from "../../platform/database/generated/public/MealAnalysisLimits.ts";
import { err, ok } from "../../shared/result.ts";
import type { ClientResult } from "../../shared/client-result.ts";

/** Across app instances: 10 attempts/client and 100 total per 15 min, one/client, two concurrent total. */
export function createAnalysisLimit(db: Kysely<Database>) {
  async function reserve(input: Readonly<{ accountId: string }>): Promise<ClientResult<string>> {
    const lease = randomUUID(), key = `client:${input.accountId}` as MealAnalysisLimitsKey, globalKey = "global" as MealAnalysisLimitsKey;
    try {
      return await db.transaction().execute(async tx => {
        for (const name of [globalKey, key]) await tx.insertInto("meal_analysis_limits").values({ key: name, window_start: sql`clock_timestamp()`, attempts: 0 }).onConflict(c => c.column("key").doNothing()).execute();
        // Always acquire the global lock first, so concurrent reservations cannot oversubscribe.
        await tx.selectFrom("meal_analysis_limits").select("key").where("key", "=", globalKey).forUpdate().executeTakeFirstOrThrow();
        await tx.updateTable("meal_analysis_limits").set({ attempts: 0, window_start: sql`clock_timestamp()` }).where("key", "in", [globalKey, key]).where("window_start", "<", sql<Date>`clock_timestamp() - interval '15 minutes'`).execute();
        const rows = await tx.selectFrom("meal_analysis_limits").select(["key", "attempts"]).where("key", "in", [globalKey, key]).execute();
        const active = await tx.selectFrom("meal_analysis_limits").select(({ fn }) => fn.countAll<string>().as("count")).where("active_until", ">", sql<Date>`clock_timestamp()`).executeTakeFirstOrThrow();
        const ownActive = await tx.selectFrom("meal_analysis_limits").select("key").where("key", "=", key).where("active_until", ">", sql<Date>`clock_timestamp()`).executeTakeFirst();
        if (ownActive || Number(active.count) >= 2 || rows.some(row => row.attempts >= (row.key === "global" ? 100 : 10))) return err({ code: "rate_limited", message: "Meal analysis is busy or you’ve reached the short-term limit. Try again later, or enter nutrition manually." });
        await tx.updateTable("meal_analysis_limits").set({ attempts: sql`attempts + 1` }).where("key", "in", [globalKey, key]).execute();
        await tx.updateTable("meal_analysis_limits").set({ lease_id: lease, active_until: sql`clock_timestamp() + interval '60 seconds'` }).where("key", "=", key).execute();
        return ok(lease);
      });
    } catch { return err({ code: "unavailable", message: "Meal analysis could not start. Try again." }); }
  }
  return { reserve, async release(input: Readonly<{ accountId: string; lease: string }>): Promise<void> {
    try { await db.updateTable("meal_analysis_limits").set({ lease_id: null, active_until: null }).where("key", "=", `client:${input.accountId}` as MealAnalysisLimitsKey).where("lease_id", "=", input.lease).execute(); }
    catch { /* The bounded lease expires if storage temporarily fails. */ }
  } } as const;
}
