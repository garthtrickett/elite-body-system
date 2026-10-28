import { mentorAccess, mentorClientScope } from "../access/index.ts";
import type { Kysely } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
import { err, ok } from "../../shared/result.ts";
import type { ClientResult } from "../../shared/client-result.ts";
import { isDay, isRecord, isRevision } from "../../shared/validation.ts";
import { entryFromRow, entryWeek, storedJson } from "./persistence.ts";
import { parseMentorSummary, validAccountId } from "./mentor-data.ts";
import type { MentorQueue, MentorHistory, MentorSummary } from "./mentor-data.ts";
import type { MentorSummarizer } from "./mentor-provider.ts";

export function createMentorCheckins(config: Readonly<{ db: Kysely<Database>; summarizer: MentorSummarizer }>) {
  const { db } = config;
  const denied = () => err({ code: "forbidden", message: "Coach access to this client is required." } as const);
  const unavailable = () => err({ code: "unavailable", message: "The coach check-ins could not be loaded or updated. Try again." } as const);
  const allowed = (actorId: string, clientId: string) => mentorAccess({ db, actorId, clientId });
  const name = (profile: unknown, fallback: string) => isRecord(profile) && typeof profile.name === "string" && profile.name.trim() ? profile.name.trim() : fallback;
  const inFlight = new Map<string, Promise<ClientResult<MentorSummary>>>();
  async function generate(input: Readonly<{ actorId: string; clientId: string; week: string }>): Promise<ClientResult<MentorSummary>> {
    const accountId = input.clientId as AccountsId, week = entryWeek(input.week);
    const row = await db.selectFrom("weekly_checkins").selectAll().where("account_id", "=", accountId).where("week", "=", week).where("submitted_at", "is not", null).executeTakeFirst();
    if (!row) return err({ code: "not_found", message: "That submitted check-in is unavailable." });
    const cached = await db.selectFrom("weekly_checkin_summaries").selectAll().where("account_id", "=", accountId).where("week", "=", week).executeTakeFirst();
    if (cached && cached.checkin_revision === row.revision) {
      const summary = parseMentorSummary(cached.summary);
      if (summary) return ok(summary);
    }
    const previous = await db.selectFrom("weekly_checkins").selectAll().where("account_id", "=", accountId).where("week", "<", week).where("submitted_at", "is not", null).orderBy("week", "desc").limit(3).execute();
    const result = await config.summarizer.summarize({ entries: [row, ...previous].map(entryFromRow) });
    if (!result.ok) return result;
    // Access may have been revoked while the provider was running.
    if (!await allowed(input.actorId, input.clientId)) return denied();
    await db.insertInto("weekly_checkin_summaries").values({ account_id: accountId, week, checkin_revision: row.revision, summary: storedJson(result.value), model: config.summarizer.model })
      .onConflict(c => c.columns(["account_id", "week"]).doNothing()).execute();
    return result;
  }
  return {
    async access(input: Readonly<{ actorId: string }>): Promise<ClientResult<Readonly<{ allowed: boolean }>>> {
      try { return ok({ allowed: !!await db.selectFrom("performance_mentors").select("account_id").where("account_id", "=", input.actorId as AccountsId).executeTakeFirst() }); }
      catch { return unavailable(); }
    },
    async queue(input: Readonly<{ actorId: string }>): Promise<ClientResult<MentorQueue>> {
      try {
        const mentor = await db.selectFrom("performance_mentors").select("account_id").where("account_id", "=", input.actorId as AccountsId).executeTakeFirst();
        if (!mentor) return denied();
        const base = db.selectFrom("weekly_checkins as c")
          .leftJoin("weekly_checkin_reviews as r", join => join.onRef("r.account_id", "=", "c.account_id").onRef("r.week", "=", "c.week"))
          .where(mentorClientScope({ actorId: input.actorId, clientRef: "c.account_id" })).where("c.submitted_at", "is not", null).where("r.account_id", "is", null);
        const rows = await base.innerJoin("accounts as owner", "owner.id", "c.account_id").leftJoin("client_profiles as p", "p.account_id", "c.account_id")
          .leftJoin("weekly_checkin_summaries as s", join => join.onRef("s.account_id", "=", "c.account_id").onRef("s.week", "=", "c.week").onRef("s.checkin_revision", "=", "c.revision"))
          .selectAll("c").select(["owner.email as client_email", "p.data as profile", "s.summary as coach_summary"]).select(eb => eb.fn.countAll<string>().over().as("queue_total"))
          .orderBy("c.submitted_at", "asc").orderBy("c.account_id", "asc").orderBy("c.week", "asc").limit(50).execute();
        return ok({ items: rows.map(row => ({ clientId: row.account_id, clientName: name(row.profile, row.client_email), entry: entryFromRow(row), summary: parseMentorSummary(row.coach_summary) ?? null })), total: Number(rows[0]?.queue_total ?? 0), summaryAvailable: config.summarizer.available });
      } catch { return unavailable(); }
    },
    async summary(input: Readonly<{ actorId: string; clientId: unknown; week: unknown }>): Promise<ClientResult<MentorSummary>> {
      if (!validAccountId(input.clientId) || !isDay(input.week)) return err({ code: "invalid_input", message: "Choose a submitted client check-in." });
      try {
        if (!await allowed(input.actorId, input.clientId)) return denied();
        const key = `${input.actorId}/${input.clientId}/${input.week}`, existing = inFlight.get(key);
        if (existing) return await existing;
        if (inFlight.size >= 4) return err({ code: "rate_limited", message: "Other summaries are being prepared. Try again shortly." });
        const request = generate({ actorId: input.actorId, clientId: input.clientId, week: input.week });
        inFlight.set(key, request);
        try { return await request; } finally { inFlight.delete(key); }
      } catch { return unavailable(); }
    },
    async review(input: Readonly<{ actorId: string; clientId: unknown; week: unknown; revision: unknown }>): Promise<ClientResult<Readonly<{ reviewed: true }>>> {
      if (!validAccountId(input.clientId) || !isDay(input.week) || !isRevision(input.revision)) return err({ code: "invalid_input", message: "Choose a submitted client check-in." });
      const clientId = input.clientId as AccountsId, week = entryWeek(input.week), revision = input.revision;
      try {
        return await db.transaction().execute(async transaction => {
          const role = await transaction.selectFrom("performance_mentors").select("account_id").where("account_id", "=", input.actorId as AccountsId).forShare().executeTakeFirst();
          await transaction.selectFrom("mentor_clients").select("client_id").where("mentor_id", "=", input.actorId as AccountsId).where("client_id", "=", clientId).forShare().executeTakeFirst();
          const assignment = role && await mentorAccess({ db: transaction, actorId: input.actorId, clientId });
          if (!assignment) return denied();
          const row = await transaction.selectFrom("weekly_checkins").selectAll().where("account_id", "=", clientId).where("week", "=", week).forUpdate().executeTakeFirst();
          if (!row?.submitted_at) return err({ code: "not_found", message: "That submitted check-in is unavailable." } as const);
          if (row.revision !== revision) return err({ code: "conflict", message: "Reload this check-in before marking it reviewed." } as const);
          await transaction.insertInto("weekly_checkin_reviews").values({ account_id: clientId, week, reviewed_by: input.actorId as AccountsId, checkin_revision: revision }).onConflict(c => c.columns(["account_id", "week"]).doNothing()).execute();
          return ok({ reviewed: true } as const);
        });
      } catch { return unavailable(); }
    },
    async history(input: Readonly<{ actorId: string; clientId: unknown; before?: unknown }>): Promise<ClientResult<MentorHistory>> {
      if (!validAccountId(input.clientId) || input.before !== undefined && !isDay(input.before)) return err({ code: "invalid_input", message: "Choose a client and valid history page." });
      try {
        if (!await allowed(input.actorId, input.clientId)) return denied();
        const owner = input.clientId as AccountsId;
        const profile = await db.selectFrom("accounts").leftJoin("client_profiles", "client_profiles.account_id", "accounts.id").select(["accounts.email", "client_profiles.data"]).where("accounts.id", "=", owner).executeTakeFirstOrThrow();
        let query = db.selectFrom("weekly_checkins as c").leftJoin("weekly_checkin_reviews as r", join => join.onRef("r.account_id", "=", "c.account_id").onRef("r.week", "=", "c.week"))
          .selectAll("c").select("r.reviewed_at").where("c.account_id", "=", owner).where("c.submitted_at", "is not", null);
        if (input.before) query = query.where("c.week", "<", entryWeek(input.before));
        const rows = await query.orderBy("c.week", "desc").limit(27).execute();
        const entries = rows.slice(0, 26).map(row => ({ entry: entryFromRow(row), reviewedAt: row.reviewed_at?.toISOString() ?? null }));
        return ok({ clientName: name(profile.data, profile.email), entries, nextCursor: rows.length > 26 ? entries.at(-1)!.entry.week : null });
      } catch { return unavailable(); }
    },
  } as const;
}
export type MentorCheckins = ReturnType<typeof createMentorCheckins>;
