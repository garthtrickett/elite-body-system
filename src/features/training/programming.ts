import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
import type { CoachingProgramAdjustmentsId, CoachingProgramAdjustments } from "../../platform/database/generated/public/CoachingProgramAdjustments.ts";
import type { ClientResult } from "../../shared/client-result.ts";
import { mentorAccess } from "../access/index.ts";
import { isDay, isText } from "../../shared/validation.ts";
import { parseProgramRules } from "./program-rules.ts";
import type { ProgramRules, ProgramAdjustment } from "./program-rules.ts";
export type { ProgramAdjustment } from "./program-rules.ts";
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const fail = (code: "invalid_input" | "conflict" | "forbidden" | "unavailable", message: string) => ({ ok: false as const, error: { code, message } });
async function available<T>(fn: () => Promise<T>): Promise<ClientResult<T>> {
  try { return { ok: true, value: await fn() }; }
  catch { return fail("unavailable", "Programming could not be loaded. Try again."); }
}
export function createProgramming(config: Readonly<{ db: Kysely<Database> }>) {
  const db = config.db;
  return {
    history: (input: Readonly<{ accountId: string; date?: string }>): Promise<ClientResult<readonly ProgramAdjustment[]>> => available(async () => {
      let query = db.selectFrom("coaching_program_adjustments").selectAll().where("client_id", "=", input.accountId as AccountsId);
      if (input.date) query = query.where("effective_from", "<=", new Date(input.date));
      const rows = await query.orderBy("effective_from", "desc").orderBy("created_at", "desc").orderBy("id", "desc").limit(50).execute();
      return rows.map(r => {
        const rules = r.plan_key === null ? {} : parseProgramRules({ planKey: r.plan_key, value: r.program_rules });
        if (!rules) throw new Error("Invalid programming rules");
        return { id: r.id, title: r.title, instructions: r.instructions, effectiveFrom: r.effective_from.toISOString().slice(0, 10), createdAt: r.created_at.toISOString(), planKey: r.plan_key, rules };
      });
    }),
    current: (input: Readonly<{ accountId: string; date: string; planKey: number }>): Promise<ClientResult<ProgramRules | undefined>> => available(async () => {
      const row = await db.selectFrom("coaching_program_adjustments").select("program_rules").where("client_id", "=", input.accountId as AccountsId).where("plan_key", "=", input.planKey).where("effective_from", "<=", new Date(input.date)).orderBy("effective_from", "desc").orderBy("created_at", "desc").orderBy("id", "desc").executeTakeFirst();
      if (!row) return;
      const rules = parseProgramRules({ planKey: input.planKey, value: row.program_rules });
      if (!rules) throw new Error("Invalid programming rules");
      return rules;
    }),
    async adjust(input: Readonly<{ actorId: string; clientId: unknown; requestId: unknown; title: unknown; instructions: unknown; effectiveFrom: unknown; planKey: unknown; rules: unknown }>): Promise<ClientResult<Readonly<{ id: string }>>> {
      if (!uuid(input.clientId) || !uuid(input.requestId) || !isText(input.title, 300) || !input.title.trim() || !isText(input.instructions, 12000) || !input.instructions.trim() || !isDay(input.effectiveFrom) || input.planKey !== null && (typeof input.planKey !== "number" || !Number.isInteger(input.planKey) || input.planKey < 1 || input.planKey > 6)) return fail("invalid_input", "Add a title, clear instructions, an effective date and a valid training session.");
      const clientId = input.clientId as AccountsId, requestId = input.requestId, planKey = input.planKey as number | null;
      const title = input.title.trim(), instructions = input.instructions.trim(), effectiveFrom = input.effectiveFrom;
      const rules = planKey === null ? {} : parseProgramRules({ planKey, value: input.rules });
      if (!rules) return fail("invalid_input", "Check the sets, reps, rest and exercise targets.");
      const receipt = (existing: CoachingProgramAdjustments): ClientResult<Readonly<{ id: string }>> => existing.client_id === clientId && existing.created_by === input.actorId && existing.title === title && existing.instructions === instructions && existing.effective_from.toISOString().slice(0, 10) === effectiveFrom && existing.plan_key === planKey && JSON.stringify(planKey === null ? {} : parseProgramRules({ planKey, value: existing.program_rules })) === JSON.stringify(rules)
        ? { ok: true, value: { id: existing.id } } : fail("conflict", "This request belongs to a different adjustment.");
      try {
        return await db.transaction().execute(async tx => {
          // Preserve access for the entire write, including an idempotent retry.
          await tx.selectFrom("performance_mentors").select("account_id").where("account_id", "=", input.actorId as AccountsId).forShare().executeTakeFirst();
          await tx.selectFrom("mentor_clients").select("client_id").where("mentor_id", "=", input.actorId as AccountsId).where("client_id", "=", clientId).forShare().executeTakeFirst();
          if (!await mentorAccess({ db: tx, actorId: input.actorId, clientId })) return fail("forbidden", "Coach access to this client is required.");
          const existing = await tx.selectFrom("coaching_program_adjustments").selectAll().where("request_id", "=", requestId).executeTakeFirst();
          if (existing) return receipt(existing);
          const id = randomUUID() as CoachingProgramAdjustmentsId;
          const row = await tx.insertInto("coaching_program_adjustments").values({ id, client_id: clientId, created_by: input.actorId as AccountsId, request_id: requestId, title, instructions, effective_from: new Date(effectiveFrom), plan_key: planKey, program_rules: JSON.stringify(rules) }).onConflict(c => c.column("request_id").doNothing()).returning("id").executeTakeFirst();
          if (row) return { ok: true, value: row };
          return receipt(await tx.selectFrom("coaching_program_adjustments").selectAll().where("request_id", "=", requestId).executeTakeFirstOrThrow());
        });
      } catch { return fail("unavailable", "The programming adjustment could not be saved. Retry the same request."); }
    },
  };
}
