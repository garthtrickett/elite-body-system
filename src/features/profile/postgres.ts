import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
import type Database from "../../platform/database/generated/Database.ts";
import { parseProfile } from "./data.ts";
import { isRecord } from "../../shared/validation.ts";
import type { ProfileStore } from "./operations.ts";
import { createScorecards } from "../scorecard/index.ts";

export function createPostgresProfileStore(db: Kysely<Database>): ProfileStore {
  return {
    async read({ accountId }) {
      const row = await db.selectFrom("client_profiles").select(["data", "revision"]).where("account_id", "=", accountId as AccountsId).executeTakeFirst();
      if (!row) return undefined;
      const parsed = parseProfile(row.data);
      if (!parsed.ok) throw new Error("Invalid stored profile");
      const signedAt = isRecord(row.data) && isRecord(row.data.consent) && typeof row.data.consent.signedAt === "string" ? row.data.consent.signedAt : undefined;
      return { revision: row.revision, profile: { ...parsed.value, consent: { ...parsed.value.consent, signedAt } } };
    },
    async write({ accountId, revision, profile }) {
      const write = async (transaction: Kysely<Database>) => {
        const data = sql`cast(${JSON.stringify(profile)} as jsonb)`;
        const row = revision === 0
          ? await transaction.insertInto("client_profiles").values({ account_id: accountId as AccountsId, data }).onConflict(c => c.column("account_id").doNothing()).returning("revision").executeTakeFirst()
          : await transaction.updateTable("client_profiles").set({ data, revision: revision + 1, updated_at: sql`clock_timestamp()` })
            .where("account_id", "=", accountId as AccountsId).where("revision", "=", revision).returning("revision").executeTakeFirst();
        if (row && profile.completed) {
          // Completion and its first daily win commit together; retries never overwrite an existing day.
          const initialized = await createScorecards(transaction).ensureStarted({ accountId, date: profile.startDate, startingWeight: profile.startingWeight, firstThought: profile.firstThought, firstGoal: profile.firstGoal });
          if (!initialized.ok) throw new Error("Could not initialize first scorecard");
        }
        return row ? { profile, revision: row.revision } : undefined;
      };
      return db.isTransaction ? write(db) : db.transaction().execute(write);
    },
  };
}
