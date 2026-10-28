import type { Kysely } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
import type { WeeklyCheckins } from "./operations.ts";

/** Enrol clients before Saturday, including clients who have not opened the app. */
export function startCheckinWorker(config: Readonly<{ db: Kysely<Database>; checkins: WeeklyCheckins }>) {
  let stopped = false, running: Promise<void> | undefined, cursor: AccountsId | undefined;
  async function scan(): Promise<void> {
    try {
      let query = config.db.selectFrom("client_profiles").select("account_id").orderBy("account_id", "asc").limit(50);
      if (cursor) query = query.where("account_id", ">", cursor);
      const rows = await query.execute();
      for (const row of rows) {
        if (stopped) return;
        cursor = row.account_id;
        const result = await config.checkins.access({ accountId: row.account_id });
        if (!result.ok) console.error("Weekly check-in enrolment unavailable");
      }
      if (rows.length < 50) cursor = undefined;
    } catch { console.error("Weekly check-in scheduler unavailable"); }
  }
  const tick = () => { if (!stopped && !running) running = scan().finally(() => { running = undefined; }); };
  const timer = setInterval(tick, 60_000); timer.unref(); tick();
  return { stop: async () => { stopped = true; clearInterval(timer); await running; } } as const;
}
