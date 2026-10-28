import type { Kysely } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
import { err, ok } from "../../shared/result.ts";
import { isDay, isRevision } from "../../shared/validation.ts";
import type { ClientResult } from "../../shared/client-result.ts";
import type { Snapshot, History } from "./data.ts";
import { incompleteSections, INCOMPLETE_SECTION_MESSAGE, parseAnswers, parseMeasurementDraft, withMeasurements, QUESTIONS } from "./data.ts";
import { entryWeek, lockClient, readHistory, readWeeklySnapshot, storedJson } from "./persistence.ts";

export function createWeeklyCheckins(config: Readonly<{ db: Kysely<Database>; enabled: boolean; hour: number; previewEmail?: string; now?: () => Date; ready?: (input: Readonly<{ accountId: string }>) => Promise<boolean> }>) {
  const { db } = config;
  const clock = config.now ?? (() => new Date());
  const unavailable = () => err({ code: "unavailable", message: "Your check-in could not be loaded or saved. Try again." } as const);
  const ready = (accountId: string) => config.ready?.({ accountId }) ?? Promise.resolve(true);
  async function readSnapshot(input: Parameters<typeof readWeeklySnapshot>[0]): Promise<Snapshot> {
    const snapshot = await readWeeklySnapshot(input);
    if (!config.previewEmail) return snapshot;
    const account = await input.db.selectFrom("accounts").select("email").where("id", "=", input.accountId as AccountsId).executeTakeFirstOrThrow();
    const flowPreview = account.email === config.previewEmail;
    return { ...snapshot, flowPreview, required: !flowPreview && snapshot.required };
  }
  async function load(input: Readonly<{ accountId: string }>, includeHistory: boolean): Promise<ClientResult<Snapshot>> {
    try {
      const eligible = await ready(input.accountId);
      return await db.transaction().execute(async transaction => {
        await lockClient(transaction, input.accountId);
        return ok(await readSnapshot({ ...config, db: transaction, accountId: input.accountId, now: clock(), ready: eligible, includeHistory }));
      });
    } catch { return unavailable(); }
  }
  return {
    get: (input: Readonly<{ accountId: string }>) => load(input, true),
    async access(input: Readonly<{ accountId: string }>): Promise<ClientResult<Readonly<{ required: boolean }>>> {
      if (!config.enabled) return ok({ required: false });
      const current = await load(input, false);
      return current.ok ? ok({ required: current.value.required }) : current;
    },
    async history(input: Readonly<{ accountId: string; before?: unknown }>): Promise<ClientResult<History>> {
      if (input.before !== undefined && !isDay(input.before)) return err({ code: "invalid_input", message: "Choose a valid history page." });
      try { return ok(await readHistory(db, input.accountId, input.before)); } catch { return unavailable(); }
    },
    async save(input: Readonly<{ accountId: string; week: unknown; revision: unknown; answers: unknown; rawMeasurements?: unknown; submit: unknown }>): Promise<ClientResult<Snapshot>> {
      const parsed = parseAnswers(input.answers);
      if (!isDay(input.week) || !isRevision(input.revision) || typeof input.submit !== "boolean" || !parsed.ok) return err({ code: "invalid_input", message: "Check your week, ratings and measurements." });
      const rawMeasurements = parseMeasurementDraft(input.rawMeasurements, parsed.value);
      if (!rawMeasurements) return err({ code: "invalid_input", message: "Check your measurement fields." });
      const answers = withMeasurements({ answers: parsed.value, rawMeasurements });
      if (input.submit && incompleteSections({ answers, rawMeasurements }).length) return err({ code: "invalid_input", message: INCOMPLETE_SECTION_MESSAGE });
      const week = input.week, revision = input.revision, submit = input.submit;
      try {
        const eligible = await ready(input.accountId);
        return await db.transaction().execute(async transaction => {
          await lockClient(transaction, input.accountId);
          const now = clock(), context = { ...config, db: transaction, accountId: input.accountId, now, ready: eligible };
          const current = await readSnapshot(context);
          if (!current.enabled || !current.enrolled || submit && !current.due || current.week !== week) return err({ code: "conflict", message: "This check-in week is not open for submission. Reload to see the current week." } as const);
          const same = current.current && JSON.stringify(current.current.answers) === JSON.stringify(answers) && JSON.stringify(current.current.rawMeasurements) === JSON.stringify(rawMeasurements);
          if (same && (!submit || current.current?.submittedAt)) return ok(current);
          if (current.current?.submittedAt) return err({ code: "conflict", message: "This check-in has already been submitted. Its saved history is preserved." } as const);
          if ((current.current?.revision ?? 0) !== revision) return err({ code: "conflict", message: "This check-in changed in another tab. Reload before saving." } as const);
          const values = { data: storedJson({ ...answers, rawMeasurements, version: "body-v1", question: QUESTIONS[answers.qIndex] }), revision: revision + 1, saved_at: now, submitted_at: submit ? now : null };
          if (!current.current) await transaction.insertInto("weekly_checkins").values({ ...values, account_id: input.accountId as AccountsId, week: entryWeek(week) }).execute();
          else await transaction.updateTable("weekly_checkins").set(values).where("account_id", "=", input.accountId as AccountsId).where("week", "=", entryWeek(week)).execute();
          return ok(await readSnapshot(context));
        });
      } catch { return unavailable(); }
    },
  } as const;
}
export type WeeklyCheckins = ReturnType<typeof createWeeklyCheckins>;
