import { CLOSER_SCRIPT, MENTOR_INTRO_SCRIPT } from "./call-script.ts";
import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
import type { SalesLeadsId } from "../../platform/database/generated/public/SalesLeads.ts";
import type { SalesCallSlotsId } from "../../platform/database/generated/public/SalesCallSlots.ts";
import type { SalesSettingsId } from "../../platform/database/generated/public/SalesSettings.ts";
import type { ClientResult } from "../../shared/client-result.ts";
import { isRecord, isRevision, isText } from "../../shared/validation.ts";
import { DEFAULT_SETTINGS, PUBLIC_PAGES, STAGES, parseSettings, safeUrl } from "./contracts.ts";
import type { Lead, JourneyEvent, ManagementSnapshot, Stage, PublicPage } from "./contracts.ts";
import { available, bookingRecord, failure, managerAllowed, readSettings, recordEvent, uuid } from "./storage.ts";
export function createSalesManagement(config: Readonly<{
    db: Kysely<Database>;
}>) {
    const db = config.db;
    const forbidden = () => failure("forbidden", "This area requires a business manager account.");
    const initialize = async () => { await db.insertInto("sales_settings").values({ id: 1 as SalesSettingsId, content: JSON.stringify(DEFAULT_SETTINGS), updated_by: null }).onConflict(c => c.column("id").doNothing()).execute(); };
    return {
        access: (input: Readonly<{
            actorId: string;
        }>) => available(async (): Promise<ClientResult<Readonly<{
            allowed: boolean;
        }>>> => ({ ok: true, value: { allowed: await managerAllowed(db, input.actorId) } })),
        snapshot: (input: Readonly<{
            actorId: string;
            before?: unknown;
            search?: unknown;
        }>) => available(async (): Promise<ClientResult<ManagementSnapshot>> => {
            if (!await managerAllowed(db, input.actorId))
                return forbidden();
            await initialize();
            const settings = await readSettings(db);
            let query = db.selectFrom("sales_leads as l").innerJoin("sales_visitors as v", "v.id", "l.visitor_id").selectAll("l").select("v.source");
            if (input.before !== undefined && input.before !== null && input.before !== "") {
                if (!uuid(input.before))
                    return failure("invalid_input", "Invalid lead page.");
                const cursor = await db.selectFrom("sales_leads").select(["created_at", "id"]).where("id", "=", input.before as SalesLeadsId).executeTakeFirst();
                if (!cursor)
                    return failure("not_found", "That lead page no longer exists.");
                query = query.where(sql<boolean> `(l.created_at, l.id) < (select created_at, id from sales_leads where id = ${cursor.id}::uuid)`);
            }
            if (input.search !== undefined && input.search !== null && input.search !== "") {
                if (!isText(input.search, 100))
                    return failure("invalid_input", "Search is too long.");
                const search = `%${input.search.replace(/[\\%_]/g, "\\$&")}%`;
                query = query.where(eb => eb.or([eb("l.name", "ilike", search), eb("l.email", "ilike", search)]));
            }
            const rows = await query.orderBy("l.created_at", "desc").orderBy("l.id", "desc").limit(51).execute();
            const calls = rows.length ? await db.selectFrom("sales_call_slots").selectAll().where("booked_lead_id", "in", rows.map(r => r.id)).execute() : [];
            const leads: Lead[] = rows.slice(0, 50).map(l => {
                const call = calls.find(c => c.booked_lead_id === l.id);
                return { id: l.id, name: l.name, email: l.email, phone: l.phone, stage: l.stage as Stage, application: isRecord(l.application) ? Object.fromEntries(Object.entries(l.application).filter((e): e is [
                        string,
                        string
                    ] => typeof e[1] === "string")) : {}, notes: l.notes, revision: l.revision, createdAt: l.created_at.toISOString(), updatedAt: l.updated_at.toISOString(), source: l.source, insightsSubscribed: !!l.insights_subscribed_at, booking: call ? bookingRecord(call) : null };
            });
            const countsRows = await db.selectFrom("sales_leads").select(["stage", eb => eb.fn.countAll<string>().as("count")]).groupBy("stage").execute();
            const viewRows = await db.selectFrom("sales_events").select(["kind", eb => eb.fn.countAll<string>().as("count")]).where("kind", "like", "view:%").groupBy("kind").execute();
            const slots = await db.selectFrom("sales_call_slots").selectAll().where("ends_at", ">", new Date()).orderBy("starts_at").limit(150).execute();
            return { ok: true, value: { ...settings, callScript: CLOSER_SCRIPT, mentorIntroScript: MENTOR_INTRO_SCRIPT, leads, hasMore: rows.length > 50, counts: Object.fromEntries(STAGES.map(s => [s, Number(countsRows.find(c => c.stage === s)?.count ?? 0)])) as Record<Stage, number>, visits: Object.fromEntries(PUBLIC_PAGES.map(p => [p, Number(viewRows.find(c => c.kind === `view:${p}`)?.count ?? 0)])) as Record<PublicPage, number>, slots: slots.map(s => ({ id: s.id, startsAt: s.starts_at.toISOString(), endsAt: s.ends_at.toISOString(), booked: !!s.booked_lead_id })) } };
        }),
        settings: (input: Readonly<{
            actorId: string;
            revision: unknown;
            settings: unknown;
        }>) => available(async (): Promise<ClientResult<Readonly<{
            revision: number;
        }>>> => {
            if (!await managerAllowed(db, input.actorId))
                return forbidden();
            const settings = parseSettings(input.settings);
            if (!settings || !isRevision(input.revision) || Buffer.byteLength(JSON.stringify(settings)) > 240000)
                return failure("invalid_input", "Check the page fields. Videos must be YouTube, Vimeo or HTTPS MP4/WebM. Published stories need a name, title, story and confirmed permission.");
            await initialize();
            const row = await db.updateTable("sales_settings").set({ content: JSON.stringify(settings), revision: input.revision + 1, updated_by: input.actorId as AccountsId, updated_at: new Date() }).where("id", "=", 1 as SalesSettingsId).where("revision", "=", input.revision).returning("revision").executeTakeFirst();
            return row ? { ok: true, value: row } : failure("conflict", "Someone changed these pages. Copy your edits, then reload before saving.");
        }),
        lead: (input: Readonly<{
            actorId: string;
            leadId: unknown;
            stage: unknown;
            notes: unknown;
            revision: unknown;
        }>) => available(async (): Promise<ClientResult<Readonly<{
            revision: number;
        }>>> => {
            if (!await managerAllowed(db, input.actorId))
                return forbidden();
            if (!uuid(input.leadId) || !STAGES.includes(input.stage as Stage) || !isText(input.notes, 12000) || !isRevision(input.revision))
                return failure("invalid_input", "Choose a stage and keep notes below 12,000 characters.");
            return db.transaction().execute(async (tx) => {
                const l = await tx.selectFrom("sales_leads").selectAll().where("id", "=", input.leadId as SalesLeadsId).forUpdate().executeTakeFirst();
                if (!l)
                    return failure("not_found", "That lead no longer exists.");
                if (l.revision !== input.revision)
                    return failure("conflict", "This lead changed. Reload it before saving.");
                if (input.stage === "call_booked" && l.stage !== "call_booked") {
                    const call = await tx.selectFrom("sales_call_slots").select("id").where("booked_lead_id", "=", l.id).executeTakeFirst();
                    if (!call)
                        return failure("invalid_input", "A confirmed call booking is required for this stage.");
                }
                await tx.updateTable("sales_leads").set({ stage: input.stage as Stage, notes: input.notes as string, revision: l.revision + 1, updated_at: new Date() }).where("id", "=", l.id).execute();
                await recordEvent(tx, { visitorId: l.visitor_id, kind: "manager_update", detail: `Stage: ${input.stage}${l.notes !== input.notes ? "; notes updated" : ""}` });
                return { ok: true, value: { revision: l.revision + 1 } };
            });
        }),
        journey: (input: Readonly<{
            actorId: string;
            leadId: unknown;
        }>) => available(async (): Promise<ClientResult<readonly JourneyEvent[]>> => {
            if (!await managerAllowed(db, input.actorId))
                return forbidden();
            if (!uuid(input.leadId))
                return failure("invalid_input", "Choose a lead.");
            const lead = await db.selectFrom("sales_leads").select("visitor_id").where("id", "=", input.leadId as SalesLeadsId).executeTakeFirst();
            if (!lead)
                return failure("not_found", "That lead no longer exists.");
            const events = await db.selectFrom("sales_events").selectAll().where("visitor_id", "=", lead.visitor_id).orderBy("created_at", "desc").limit(100).execute();
            return { ok: true, value: events.map(e => ({ id: e.id, kind: e.kind, detail: e.detail, createdAt: e.created_at.toISOString() })) };
        }),
        slot: (input: Readonly<{
            actorId: string;
            startsAt: unknown;
            endsAt: unknown;
            meetingUrl: unknown;
        }>) => available(async (): Promise<ClientResult<Readonly<{
            id: string;
        }>>> => {
            if (!await managerAllowed(db, input.actorId))
                return forbidden();
            if (!isText(input.startsAt, 50) || !isText(input.endsAt, 50) || !safeUrl(input.meetingUrl))
                return failure("invalid_input", "Enter a valid call time and an HTTPS meeting link, if available.");
            const start = new Date(input.startsAt), end = new Date(input.endsAt);
            if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start.getTime() <= Date.now() || end.getTime() <= start.getTime() || end.getTime() - start.getTime() > 4 * 60 * 60 * 1000 || start.getTime() > Date.now() + 366 * 86400000)
                return failure("invalid_input", "Add a future call, up to four hours long, within the next year.");
            await initialize();
            return db.transaction().execute(async (tx) => {
                await tx.selectFrom("sales_settings").select("id").where("id", "=", 1 as SalesSettingsId).forUpdate().executeTakeFirstOrThrow();
                const overlap = await tx.selectFrom("sales_call_slots").select("id").where("starts_at", "<", end).where("ends_at", ">", start).executeTakeFirst();
                if (overlap)
                    return failure("conflict", "This overlaps an existing call time.");
                const id = randomUUID() as SalesCallSlotsId;
                await tx.insertInto("sales_call_slots").values({ id, starts_at: start, ends_at: end, meeting_url: input.meetingUrl as string, booked_lead_id: null }).execute();
                return { ok: true, value: { id } };
            });
        }),
        cancelBooking: (input: Readonly<{
            actorId: string;
            leadId: unknown;
            revision: unknown;
        }>) => available(async (): Promise<ClientResult<Readonly<{
            revision: number;
        }>>> => {
            if (!await managerAllowed(db, input.actorId))
                return forbidden();
            if (!uuid(input.leadId) || !isRevision(input.revision))
                return failure("invalid_input", "Choose a current client booking.");
            return db.transaction().execute(async (tx) => {
                const lead = await tx.selectFrom("sales_leads").selectAll().where("id", "=", input.leadId as SalesLeadsId).forUpdate().executeTakeFirst();
                if (!lead)
                    return failure("not_found", "That lead no longer exists.");
                if (lead.revision !== input.revision)
                    return failure("conflict", "This lead changed. Reload it before cancelling the call.");
                await tx.selectFrom("sales_settings").select("id").where("id", "=", 1 as SalesSettingsId).forUpdate().executeTakeFirstOrThrow();
                const call = await tx.selectFrom("sales_call_slots").selectAll().where("booked_lead_id", "=", lead.id).forUpdate().executeTakeFirst();
                if (!call)
                    return failure("conflict", "This lead has no active booking. Reload its record.");
                await tx.updateTable("sales_call_slots").set({ booked_lead_id: null }).where("id", "=", call.id).execute();
                await tx.updateTable("sales_leads").set({ revision: lead.revision + 1, updated_at: new Date(), stage: lead.stage === "call_booked" ? "applied" : lead.stage }).where("id", "=", lead.id).execute();
                await recordEvent(tx, { visitorId: lead.visitor_id, kind: "call_cancelled", detail: call.starts_at.toISOString() });
                return { ok: true, value: { revision: lead.revision + 1 } };
            });
        }),
        removeSlot: (input: Readonly<{
            actorId: string;
            slotId: unknown;
        }>) => available(async (): Promise<ClientResult<Readonly<{
            removed: boolean;
        }>>> => {
            if (!await managerAllowed(db, input.actorId))
                return forbidden();
            if (!uuid(input.slotId))
                return failure("invalid_input", "Choose a call time.");
            const row = await db.deleteFrom("sales_call_slots").where("id", "=", input.slotId as SalesCallSlotsId).where("booked_lead_id", "is", null).returning("id").executeTakeFirst();
            return row ? { ok: true, value: { removed: true } } : failure("conflict", "Booked calls cannot be removed here.");
        }),
    };
}
export type SalesManagement = ReturnType<typeof createSalesManagement>;
