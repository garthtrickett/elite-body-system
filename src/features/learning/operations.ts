import { sql } from "kysely";
import type { Kysely } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
import type { MapReadsDay } from "../../platform/database/generated/public/MapReads.ts";
import { isDay, isRevision, isText } from "../../shared/validation.ts";
import { err, ok } from "../../shared/result.ts";
import type { ClientResult, createProfiles } from "../profile/index.ts";
import { clientDay } from "../profile/index.ts";
import { recordCompletion } from "../scorecard/index.ts";
import type { createContentMedia } from "../content/index.ts";
import { EPISODES } from "./courses.ts";
import { parseMap, parseProgress, emptyMap, mapWritten, episodeStatus } from "./data.ts";
import type { LearningSnapshot } from "./data.ts";

export function createLearning(config: Readonly<{ db: Kysely<Database>; profiles: ReturnType<typeof createProfiles>; media: ReturnType<typeof createContentMedia>; now?: () => Date }>) {
  const db = config.db, now = config.now ?? (() => new Date());
  async function hasRead(input: Readonly<{ accountId: string; date: string }>): Promise<ClientResult<boolean>> {
    if (!isDay(input.date)) return err({ code: "invalid_input", message: "Invalid reading date." });
    try { return ok(!!await db.selectFrom("map_reads").select("day").where("account_id", "=", input.accountId as AccountsId).where("day", "=", new Date(input.date) as MapReadsDay).executeTakeFirst()); }
    catch { return err({ code: "unavailable", message: "Map reading could not be loaded." }); }
  }
  async function get(input: Readonly<{ accountId: string }>): Promise<ClientResult<LearningSnapshot>> {
    try {
      const profile = await config.profiles.get(input); if (!profile.ok) return profile;
      const p = profile.value.profile, today = clientDay({ timezone: p.timezone, now: now() });
      const [mapRow, progressRow, read, videos] = await Promise.all([
        db.selectFrom("neural_maps").select(["data", "revision"]).where("account_id", "=", input.accountId as AccountsId).executeTakeFirst(),
        db.selectFrom("course_progress").select(["data", "revision"]).where("account_id", "=", input.accountId as AccountsId).executeTakeFirst(),
        hasRead({ accountId: input.accountId, date: today }), config.media.list(),
      ]);
      if (!read.ok) return read; if (!videos.ok) return videos;
      const map = mapRow ? parseMap(mapRow.data) : emptyMap(p.identity ? `I’m becoming someone who ${p.identity}` : "");
      const progress = progressRow ? parseProgress(progressRow.data) : { answers: {}, done: {} };
      if (!map || !progress) return err({ code: "unavailable", message: "Learning progress could not be read." });
      return ok({ map, mapRevision: mapRow?.revision ?? 0, progress, progressRevision: progressRow?.revision ?? 0,
        week: Math.max(1, Math.floor((Date.parse(today) - Date.parse(p.startDate)) / 604800000) + 1), setupComplete: p.completed, mapRead: read.value, videoUrls: videos.value });
    } catch { return err({ code: "unavailable", message: "Learning could not be loaded." }); }
  }
  return {
    get, hasRead,
    async saveMap(input: Readonly<{ accountId: string; revision: unknown; map: unknown; finish?: boolean }>): Promise<ClientResult<LearningSnapshot>> {
      const map = parseMap(input.map);
      if (!map || !isRevision(input.revision)) return err({ code: "invalid_input", message: "Check the Map fields and revision." });
      if (input.finish && !mapWritten(map)) return err({ code: "invalid_input", message: "Write every part before finishing your Map." });
      try {
        const accountId = input.accountId as AccountsId, data = sql`cast(${JSON.stringify(map)} as jsonb)`;
        const row = input.revision === 0
          ? await db.insertInto("neural_maps").values({ account_id: accountId, data }).onConflict(c => c.column("account_id").doNothing()).returning("revision").executeTakeFirst()
          : await db.updateTable("neural_maps").set({ data, revision: input.revision + 1 }).where("account_id", "=", accountId).where("revision", "=", input.revision).returning("revision").executeTakeFirst();
        return row ? get({ accountId: input.accountId }) : err({ code: "conflict", message: "Your Map changed in another tab. Reload before saving." });
      } catch { return err({ code: "unavailable", message: "Your Map was not saved. Try again." }); }
    },
    async readMap(input: Readonly<{ accountId: string }>): Promise<ClientResult<LearningSnapshot>> {
      const snapshot = await get(input); if (!snapshot.ok) return snapshot;
      if (!mapWritten(snapshot.value.map)) return err({ code: "invalid_input", message: "Write your Map before marking it read." });
      const profile = await config.profiles.get(input); if (!profile.ok) return profile;
      try {
        const date = clientDay({ timezone: profile.value.profile.timezone, now: now() });
        await db.transaction().execute(async tx => {
          await tx.insertInto("map_reads").values({ account_id: input.accountId as AccountsId, day: new Date(date) as MapReadsDay })
            .onConflict(c => c.columns(["account_id", "day"]).doNothing()).execute();
          const recorded = await recordCompletion({ transaction: tx, accountId: input.accountId, date, check: "map" });
          if (!recorded.ok) throw new Error("Map completion unavailable");
        });
        return get(input);
      } catch { return err({ code: "unavailable", message: "Today’s reading was not saved." }); }
    },
    async saveEpisode(input: Readonly<{ accountId: string; id: unknown; revision: unknown; answers: unknown; complete: boolean }>): Promise<ClientResult<LearningSnapshot>> {
      const episode = EPISODES.find(item => item.id === input.id);
      if (!episode || !isRevision(input.revision) || !Array.isArray(input.answers) || input.answers.length > episode.tasks.length || !input.answers.every(answer => isText(answer, 5000))) return err({ code: "invalid_input", message: "Check the lesson answers and revision." });
      const snapshot = await get({ accountId: input.accountId }); if (!snapshot.ok) return snapshot;
      if (snapshot.value.progressRevision !== input.revision) return err({ code: "conflict", message: "Your course progress changed in another tab. Reload before saving." });
      if (episodeStatus({ episode, snapshot: snapshot.value }) !== "open") return err({ code: "forbidden", message: "This lesson is locked or already complete." });
      const answers = input.answers as string[];
      if (input.complete && !episode.tasks.every((_, index) => answers[index]?.trim())) return err({ code: "invalid_input", message: "Answer every task before completing the lesson." });
      const progress = { answers: { ...snapshot.value.progress.answers, [episode.id]: answers }, done: { ...snapshot.value.progress.done, [episode.id]: input.complete } };
      try {
        const accountId = input.accountId as AccountsId, data = sql`cast(${JSON.stringify(progress)} as jsonb)`;
        const row = input.revision === 0
          ? await db.insertInto("course_progress").values({ account_id: accountId, data }).onConflict(c => c.column("account_id").doNothing()).returning("revision").executeTakeFirst()
          : await db.updateTable("course_progress").set({ data, revision: input.revision + 1 }).where("account_id", "=", accountId).where("revision", "=", input.revision).returning("revision").executeTakeFirst();
        return row ? get({ accountId: input.accountId }) : err({ code: "conflict", message: "Your course progress changed in another tab. Reload before saving." });
      } catch { return err({ code: "unavailable", message: "Lesson progress was not saved. Try again." }); }
    },
  } as const;
}
