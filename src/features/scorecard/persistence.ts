import { sql } from "kysely";
import type { Kysely, Transaction } from "kysely";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
import type { DailyScorecardsDay } from "../../platform/database/generated/public/DailyScorecards.ts";
import type Database from "../../platform/database/generated/Database.ts";
import { err, ok } from "../../shared/result.ts";
import { isDay, isRevision } from "../../shared/validation.ts";
import type { ClientResult } from "../profile/index.ts";
import { emptyScorecard, parseScorecard, setMetric } from "./operations.ts";
import type { Scorecard } from "./operations.ts";

export type DaySnapshot = Readonly<{ date: string; scorecard: Scorecard; revision: number }>;
/** Activity owners call this in their own transaction so historical tracking stays durable. */
export async function recordCompletion(input: Readonly<{ transaction: Transaction<Database>; accountId: string; date: string; check: "training" | "map" }>): Promise<ClientResult<Readonly<{ recorded: true }>>> {
  if (!isDay(input.date)) return err({ code: "invalid_input", message: "Invalid completion date." });
  const db = input.transaction, accountId = input.accountId as AccountsId, day = new Date(input.date) as DailyScorecardsDay;
  await db.insertInto("daily_scorecards").values({ account_id: accountId, day, data: sql`cast(${JSON.stringify(emptyScorecard())} as jsonb)` })
    .onConflict(c => c.columns(["account_id", "day"]).doNothing()).execute();
  const row = await db.selectFrom("daily_scorecards").select(["data", "revision"]).where("account_id", "=", accountId).where("day", "=", day).forUpdate().executeTakeFirstOrThrow();
  const parsed = parseScorecard(row.data); if (!parsed.ok) return parsed;
  if (!parsed.value.checks[input.check]) await db.updateTable("daily_scorecards").set({ data: sql`cast(${JSON.stringify({ ...parsed.value, checks: { ...parsed.value.checks, [input.check]: true } })} as jsonb)`, revision: row.revision + 1, updated_at: sql`clock_timestamp()` }).where("account_id", "=", accountId).where("day", "=", day).execute();
  return ok({ recorded: true });
}
/** Call inside the meal transaction: row locking makes additive logging safe against concurrent daily edits. */
export async function adjustNutrition(input: Readonly<{ transaction: Transaction<Database>; accountId: string; date: string; energy: number; protein: number }>): Promise<ClientResult<DaySnapshot>> {
  if (!isDay(input.date) || !Number.isFinite(input.energy) || !Number.isFinite(input.protein)) return err({ code: "invalid_input", message: "Invalid meal totals." });
  const db = input.transaction, accountId = input.accountId as AccountsId, day = new Date(input.date) as DailyScorecardsDay;
  await db.insertInto("daily_scorecards").values({ account_id: accountId, day, data: sql`cast(${JSON.stringify(emptyScorecard())} as jsonb)` })
    .onConflict(c => c.columns(["account_id", "day"]).doNothing()).execute();
  const row = await db.selectFrom("daily_scorecards").select(["data", "revision"]).where("account_id", "=", accountId).where("day", "=", day).forUpdate().executeTakeFirstOrThrow();
  const parsed = parseScorecard(row.data); if (!parsed.ok) return parsed;
  const energy = setMetric({ scorecard: parsed.value, metric: "energy", value: String(Math.max(0, Math.round((parsed.value.values.energy ?? 0) + input.energy))) });
  if (!energy.ok) return energy;
  const protein = setMetric({ scorecard: energy.value, metric: "protein", value: String(Math.max(0, Math.round(((parsed.value.values.protein ?? 0) + input.protein) * 10) / 10)) });
  if (!protein.ok) return protein;
  await db.updateTable("daily_scorecards").set({ data: sql`cast(${JSON.stringify(protein.value)} as jsonb)`, revision: row.revision + 1, updated_at: sql`clock_timestamp()` }).where("account_id", "=", accountId).where("day", "=", day).execute();
  return ok({ date: input.date, scorecard: protein.value, revision: row.revision + 1 });
}
export function createScorecards(db: Kysely<Database>) {
  return {
    async ensureStarted(input: Readonly<{ accountId: string; date: string; startingWeight: number | undefined; firstThought: string; firstGoal: string }>): Promise<ClientResult<Readonly<{ initialized: true }>>> {
      const empty = emptyScorecard();
      const card = parseScorecard({ ...empty, values: { ...empty.values, weight: input.startingWeight }, brainDump: input.firstThought,
        goals: input.firstGoal ? [{ id: 1, text: input.firstGoal, priority: true }] : [] });
      if (!isDay(input.date) || !card.ok) return err({ code: "invalid_input", message: "Invalid starting scorecard." });
      try {
        await db.insertInto("daily_scorecards").values({ account_id: input.accountId as AccountsId, day: new Date(input.date) as DailyScorecardsDay,
          data: sql`cast(${JSON.stringify(card.value)} as jsonb)` }).onConflict(c => c.columns(["account_id", "day"]).doNothing()).execute();
        return ok({ initialized: true });
      } catch { return err({ code: "unavailable", message: "Starting scorecard could not be saved." }); }
    },
    async get(input: Readonly<{ accountId: string; date: string }>): Promise<ClientResult<DaySnapshot>> {
      if (!isDay(input.date)) return err({ code: "invalid_input", message: "Choose a valid date." });
      try {
        const row = await db.selectFrom("daily_scorecards").select(["data", "revision"]).where("account_id", "=", input.accountId as AccountsId).where("day", "=", new Date(input.date) as DailyScorecardsDay).executeTakeFirst();
        if (!row) return ok({ date: input.date, scorecard: emptyScorecard(), revision: 0 });
        const parsed = parseScorecard(row.data);
        return parsed.ok ? ok({ date: input.date, scorecard: parsed.value, revision: row.revision }) : err({ code: "unavailable", message: "Stored scorecard could not be read." });
      } catch { return err({ code: "unavailable", message: "Scorecard could not be loaded." }); }
    },
    async history(input: Readonly<{ accountId: string }>): Promise<ClientResult<readonly DaySnapshot[]>> {
      try {
        const rows = await db.selectFrom("daily_scorecards").select(["day", "data", "revision"]).where("account_id", "=", input.accountId as AccountsId).orderBy("day", "desc").limit(100).execute();
        const days: DaySnapshot[] = [];
        for (const row of rows) {
          const parsed = parseScorecard(row.data);
          if (!parsed.ok) return err({ code: "unavailable", message: "Scorecard history could not be read." });
          days.push({ date: row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day), scorecard: parsed.value, revision: row.revision });
        }
        return ok(days);
      } catch { return err({ code: "unavailable", message: "Scorecard history could not be loaded." }); }
    },
    async save(input: Readonly<{ accountId: string; date: unknown; revision: unknown; scorecard: unknown }>): Promise<ClientResult<DaySnapshot>> {
      if (!isDay(input.date) || !isRevision(input.revision)) return err({ code: "invalid_input", message: "A date and revision are required." });
      const parsed = parseScorecard(input.scorecard);
      if (!parsed.ok) return parsed;
      try {
        const data = sql`cast(${JSON.stringify(parsed.value)} as jsonb)`;
        const row = input.revision === 0
          ? await db.insertInto("daily_scorecards").values({ account_id: input.accountId as AccountsId, day: new Date(input.date) as DailyScorecardsDay, data }).onConflict(c => c.columns(["account_id", "day"]).doNothing()).returning("revision").executeTakeFirst()
          : await db.updateTable("daily_scorecards").set({ data, revision: input.revision + 1, updated_at: sql`clock_timestamp()` }).where("account_id", "=", input.accountId as AccountsId).where("day", "=", new Date(input.date) as DailyScorecardsDay).where("revision", "=", input.revision).returning("revision").executeTakeFirst();
        return row ? ok({ date: input.date, scorecard: parsed.value, revision: row.revision }) : err({ code: "conflict", message: "This day changed in another tab. Reload before saving." });
      } catch { return err({ code: "unavailable", message: "Scorecard was not saved. Try again." }); }
    },
  } as const;
}
