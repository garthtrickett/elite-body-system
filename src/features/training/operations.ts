import { sql } from "kysely";
import type { Kysely } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
import type { WorkoutSessionsDay } from "../../platform/database/generated/public/WorkoutSessions.ts";
import { isDay, isRevision } from "../../shared/validation.ts";
import { err, ok } from "../../shared/result.ts";
import { createContentMedia } from "../content/index.ts";
import { recordCompletion } from "../scorecard/index.ts";
import { clientDay } from "../profile/index.ts";
import type { ClientResult, createProfiles } from "../profile/index.ts";
import { parseWorkout, emptyWorkout, planFor, workoutStats } from "./data.ts";
import type { TrainingSnapshot, Workout } from "./data.ts";

export function createTraining(config: Readonly<{ db: Kysely<Database>; profiles: ReturnType<typeof createProfiles>; now?: () => number }>) {
  const db = config.db, now = config.now ?? Date.now, media = createContentMedia(config.db);
  async function get(input: Readonly<{ accountId: string; date?: string }>): Promise<ClientResult<TrainingSnapshot>> {
    try {
      const profile = await config.profiles.get({ accountId: input.accountId }); if (!profile.ok) return profile;
      const date = input.date ?? clientDay({ timezone: profile.value.profile.timezone, now: new Date(now()) });
      if (!isDay(date)) return err({ code: "invalid_input", message: "Choose a valid workout date." });
      const rows = await db.selectFrom("workout_sessions").select(["data", "revision"]).where("account_id", "=", input.accountId as AccountsId).where("day", "<=", new Date(date) as WorkoutSessionsDay).orderBy("day", "desc").limit(100).execute();
      const parsed = rows.map(row => ({ result: parseWorkout(row.data), revision: row.revision }));
      if (parsed.some(row => !row.result.ok)) return err({ code: "unavailable", message: "Workout history could not be read." });
      const history: Workout[] = [];
      let workout: Workout | undefined, revision = 0;
      for (const row of parsed) if (row.result.ok) { history.push(row.result.value); if (row.result.value.date === date) { workout = row.result.value; revision = row.revision; } }
      const videos = await media.list(); if (!videos.ok) return videos;
      const p = profile.value.profile;
      return ok({ workout: workout ?? emptyWorkout({ date, planKey: planFor({ profile: p, date }) }), revision, history, videoUrls: videos.value,
        blocked: !p.completed ? "setup_required" : p.health.answers.some(Boolean) && !p.health.clearance ? "clearance_required" : null,
        readOnly: date > clientDay({ timezone: p.timezone, now: new Date(now()) }) });
    } catch { return err({ code: "unavailable", message: "Your workout could not be loaded." }); }
  }
  return {
    get,
    async save(input: Readonly<{ accountId: string; revision: unknown; workout: unknown; finish?: boolean }>): Promise<ClientResult<TrainingSnapshot>> {
      if (!isRevision(input.revision)) return err({ code: "invalid_input", message: "A workout revision is required." });
      const parsed = parseWorkout(input.workout); if (!parsed.ok) return parsed;
      const current = await get({ accountId: input.accountId, date: parsed.value.date }); if (!current.ok) return current;
      if (current.value.blocked) return err({ code: "forbidden", message: current.value.blocked === "setup_required" ? "Complete your setup before training." : "Confirm doctor clearance in your profile before training." });
      if (current.value.workout.planKey !== parsed.value.planKey) return err({ code: "invalid_input", message: "This workout does not match your program for that date." });
      const profile = await config.profiles.get({ accountId: input.accountId }); if (!profile.ok) return profile;
      if (parsed.value.date > clientDay({ timezone: profile.value.profile.timezone, now: new Date(now()) })) return err({ code: "invalid_input", message: "Future workouts can be previewed but cannot be logged." });
      if ((input.finish || current.value.workout.finishedAt !== null) && !workoutStats({ workout: parsed.value, history: current.value.history }).hasActivity) return err({ code: "invalid_input", message: "Log at least one set or recovery activity before finishing." });
      const restUntil = parsed.value.restUntil;
      if (restUntil !== null && restUntil > now() + 3600000) return err({ code: "invalid_input", message: "Rest timers cannot exceed one hour." });
      const workout = { ...parsed.value, startedAt: current.value.workout.startedAt ?? now(),
        finishedAt: input.finish ? current.value.workout.finishedAt ?? now() : current.value.workout.finishedAt,
        restUntil: input.finish ? null : restUntil };
      try {
        const data = sql`cast(${JSON.stringify(workout)} as jsonb)`, accountId = input.accountId as AccountsId, date = new Date(workout.date) as WorkoutSessionsDay;
        const row = await db.transaction().execute(async tx => {
          const saved = input.revision === 0
            ? await tx.insertInto("workout_sessions").values({ account_id: accountId, day: date, data }).onConflict(c => c.columns(["account_id", "day"]).doNothing()).returning("revision").executeTakeFirst()
            : await tx.updateTable("workout_sessions").set({ data, revision: Number(input.revision) + 1 }).where("account_id", "=", accountId).where("day", "=", date).where("revision", "=", Number(input.revision)).returning("revision").executeTakeFirst();
          if (saved && workout.finishedAt !== null) {
            const recorded = await recordCompletion({ transaction: tx, accountId: input.accountId, date: workout.date, check: "training" });
            if (!recorded.ok) throw new Error("Training completion unavailable");
          }
          return saved;
        });
        return row ? ok({ ...current.value, workout, revision: row.revision, history: [workout, ...current.value.history.filter(item => item.date !== workout.date)].slice(0, 100) })
          : err({ code: "conflict", message: "This workout changed in another tab. Reload before saving." });
      } catch { return err({ code: "unavailable", message: "Workout was not saved. Try again." }); }
    },
  } as const;
}
