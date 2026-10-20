import { sql } from "kysely";
import type { Kysely, Transaction } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
import type { AuthChallengesDigest } from "../../platform/database/generated/public/AuthChallenges.ts";
import type { AuthSessionsDigest } from "../../platform/database/generated/public/AuthSessions.ts";
import type { AuthRateLimitsDigest } from "../../platform/database/generated/public/AuthRateLimits.ts";
import type { AuthStore } from "./contracts.ts";

async function takeBudget(trx: Transaction<Database>, digest: string, limit: number): Promise<boolean> {
  const old = sql<boolean>`auth_rate_limits.window_started_at <= clock_timestamp() - interval '15 minutes'`;
  const row = await trx.insertInto("auth_rate_limits")
    .values({ digest: digest as AuthRateLimitsDigest, attempts: 1 })
    .onConflict(c => c.column("digest").doUpdateSet({
      window_started_at: sql<Date>`case when ${old} then clock_timestamp() else auth_rate_limits.window_started_at end`,
      attempts: sql<number>`case when ${old} then 1 else auth_rate_limits.attempts + 1 end`,
    }).where(sql<boolean>`${old} or auth_rate_limits.attempts < ${limit}`))
    .returning("attempts").executeTakeFirst();
  return !!row;
}

/** Exceptions stay internal; the public operation interface translates them to typed failures. */
export function createPostgresAuthStore(db: Kysely<Database>): AuthStore {
  return {
    async provision({ email }) {
      return db.insertInto("accounts").values({ email })
        .onConflict(c => c.column("email").doUpdateSet({ email }))
        .returning(["id", "email"]).executeTakeFirstOrThrow();
    },
    async findAccount({ email }) {
      return db.selectFrom("accounts").select(["id", "email"]).where("email", "=", email).executeTakeFirst();
    },
    async reserve(keys) {
      return db.transaction().execute(async trx => {
        // A shared first row orders all budget reservations across processes.
        if (!await takeBudget(trx, keys.global, 200)) return false;
        await trx.deleteFrom("auth_rate_limits").where("window_started_at", "<=", sql<Date>`clock_timestamp() - interval '15 minutes'`)
          .where("digest", "!=", keys.global as AuthRateLimitsDigest).execute();
        if (!await takeBudget(trx, keys.client, 20)) return false;
        return takeBudget(trx, keys.recipient, 5);
      });
    },
    async issue({ digest, accountId }) {
      await db.transaction().execute(async trx => {
        await trx.deleteFrom("auth_challenges").where("expires_at", "<=", sql<Date>`clock_timestamp()`).execute();
        await trx.deleteFrom("auth_sessions").where("idle_expires_at", "<=", sql<Date>`clock_timestamp()`).execute();
        await trx.insertInto("auth_challenges").values({ digest: digest as AuthChallengesDigest,
          account_id: accountId as AccountsId }).execute();
      });
    },
    async inspect({ digest }) {
      return db.selectFrom("auth_challenges").innerJoin("accounts", "accounts.id", "auth_challenges.account_id")
        .select(["accounts.id", "accounts.email"])
        .where("digest", "=", digest as AuthChallengesDigest)
        .where("expires_at", ">", sql<Date>`clock_timestamp()`).executeTakeFirst();
    },
    async revokeChallenge({ digest }) {
      await db.deleteFrom("auth_challenges").where("digest", "=", digest as AuthChallengesDigest).execute();
    },
    async redeem({ digest, sessionDigest }) {
      return db.transaction().execute(async trx => {
        // Lock before checking wall-clock expiry: waiting must never extend a link.
        await trx.selectFrom("auth_challenges").select("digest")
          .where("digest", "=", digest as AuthChallengesDigest).forUpdate().executeTakeFirst();
        const consumed = await trx.deleteFrom("auth_challenges").where("digest", "=", digest as AuthChallengesDigest)
          .where("expires_at", ">", sql<Date>`clock_timestamp()`).returning("account_id").executeTakeFirst();
        if (!consumed) return undefined;
        await trx.insertInto("auth_sessions").values({ digest: sessionDigest as AuthSessionsDigest,
          account_id: consumed.account_id }).execute();
        return trx.selectFrom("accounts").select(["id", "email"])
          .where("id", "=", consumed.account_id).executeTakeFirstOrThrow();
      });
    },
    async session({ digest }) {
      return db.transaction().execute(async trx => {
        await trx.selectFrom("auth_sessions").select("digest")
          .where("digest", "=", digest as AuthSessionsDigest).forUpdate().executeTakeFirst();
        const session = await trx.updateTable("auth_sessions")
          .set({ idle_expires_at: sql<Date>`least(absolute_expires_at, clock_timestamp() + interval '30 minutes')` })
          .where("digest", "=", digest as AuthSessionsDigest)
          .where("idle_expires_at", ">", sql<Date>`clock_timestamp()`)
          .where("absolute_expires_at", ">", sql<Date>`clock_timestamp()`)
          .returning("account_id").executeTakeFirst();
        if (!session) return undefined;
        return trx.selectFrom("accounts").select(["id", "email"])
          .where("id", "=", session.account_id).executeTakeFirst();
      });
    },
    async signOut({ digest }) {
      await db.deleteFrom("auth_sessions").where("digest", "=", digest as AuthSessionsDigest).execute();
    },
  };
}
