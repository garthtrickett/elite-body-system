import { sql } from "kysely";
import type { Kysely, Transaction } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
import type { WeeklyCheckins, WeeklyCheckinsWeek } from "../../platform/database/generated/public/WeeklyCheckins.ts";
import { clientDay, parseProfile } from "../profile/index.ts";
import { firstSaturday, parseAnswers, parseMeasurementDraft, weeklyPeriod } from "./data.ts";
import type { Entry, Snapshot, History } from "./data.ts";
import { isRecord, isText } from "../../shared/validation.ts";

export const storedJson = (value: unknown) => sql`cast(${JSON.stringify(value)} as jsonb)`;
export const dateText = (value: Date | string): string => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
export const entryWeek = (week: string) => new Date(`${week}T00:00:00Z`) as WeeklyCheckinsWeek;
export async function lockClient(db: Transaction<Database>, accountId: string): Promise<void> {
  await db.selectFrom("accounts").select("id").where("id", "=", accountId as AccountsId).forUpdate().executeTakeFirstOrThrow();
}
export function entryFromRow(row: WeeklyCheckins): Entry {
  const answers = parseAnswers(row.data);
  if (!answers.ok || !isRecord(row.data) || !isText(row.data.question, 1000) || row.data.version !== "body-v1") throw new Error("Stored check-in unavailable");
  const rawMeasurements = parseMeasurementDraft(row.data.rawMeasurements, answers.value);
  if (!rawMeasurements) throw new Error("Stored measurement draft unavailable");
  return { week: dateText(row.week), revision: row.revision, answers: answers.value, rawMeasurements, question: row.data.question, savedAt: row.saved_at.toISOString(), submittedAt: row.submitted_at?.toISOString() ?? null };
}
export async function readHistory(db: Kysely<Database>, accountId: string, before?: string): Promise<History> {
  let query = db.selectFrom("weekly_checkins").selectAll().where("account_id", "=", accountId as AccountsId).where("submitted_at", "is not", null);
  if (before) query = query.where("week", "<", entryWeek(before));
  const rows = await query.orderBy("week", "desc").limit(27).execute();
  const entries = rows.slice(0, 26).map(entryFromRow);
  return { entries, nextCursor: rows.length > 26 ? entries.at(-1)!.week : null };
}
export async function readWeeklySnapshot(input: Readonly<{ db: Transaction<Database>; accountId: string; now: Date; enabled: boolean; hour: number; ready: boolean; includeHistory?: boolean }>): Promise<Snapshot> {
  const { db, accountId, now, enabled, hour, ready } = input;
  const owner = accountId as AccountsId;
  const row = await db.selectFrom("client_profiles").select("data").where("account_id", "=", owner).executeTakeFirst();
  const parsed = row ? parseProfile(row.data) : undefined;
  if (row && !parsed?.ok) throw new Error("Profile unavailable");
  const profile = parsed?.ok ? parsed.value : undefined;
  const previousSchedule = await db.selectFrom("weekly_checkin_schedules").selectAll().where("account_id", "=", owner).executeTakeFirst();
  const timezone = profile?.timezone ?? "UTC";
  const today = clientDay({ timezone, now });
  const enrolled = (!!profile?.completed || !!previousSchedule) && ready;
  if (enabled && enrolled && !previousSchedule && profile) {
    await db.insertInto("weekly_checkin_schedules").values({ account_id: owner, timezone, first_week: firstSaturday(profile.startDate > today ? profile.startDate : today) })
      .onConflict(c => c.column("account_id").doNothing()).execute();
  }
  const schedule = previousSchedule ?? await db.selectFrom("weekly_checkin_schedules").selectAll().where("account_id", "=", owner).executeTakeFirst();
  const period = schedule ? weeklyPeriod({ now, timezone: schedule.timezone, firstWeek: dateText(schedule.first_week), hour }) : { week: firstSaturday(today), due: false };
  const current = await db.selectFrom("weekly_checkins").selectAll().where("account_id", "=", owner).where("week", "=", entryWeek(period.week)).executeTakeFirst();
  const history = input.includeHistory === false ? { entries: [], nextCursor: null } : await readHistory(db, accountId);
  return { enabled, enrolled, timezone: schedule?.timezone ?? timezone, hour, ...period, due: enabled && enrolled && period.due, required: enabled && enrolled && period.due && !current?.submitted_at,
    current: current ? entryFromRow(current) : null, history: history.entries, nextCursor: history.nextCursor };
}
