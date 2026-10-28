import type { SalesSettingsId } from "../../platform/database/generated/public/SalesSettings.ts";
import { createHash, randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { SalesVisitorsId } from "../../platform/database/generated/public/SalesVisitors.ts";
import type { SalesLeadsId } from "../../platform/database/generated/public/SalesLeads.ts";
import type { SalesCallSlotsId } from "../../platform/database/generated/public/SalesCallSlots.ts";
import type { ClientResult } from "../../shared/client-result.ts";
import { isRecord, isText } from "../../shared/validation.ts";
import { PUBLIC_PAGES, parseApplication } from "./contracts.ts";
import type { PublicSnapshot, PublicPage } from "./contracts.ts";
import { available, bookingRecord, failure, readSettings, recordEvent, uuid } from "./storage.ts";
export function createPublicSales(config: Readonly<{
    db: Kysely<Database>;
}>) {
    const db = config.db;
    const hash = (token: string) => createHash("sha256").update(token).digest("hex");
    const visitor = async (token: string) => /^[a-zA-Z0-9_-]{43}$/.test(token) ? db.selectFrom("sales_visitors").select("id").where("token_hash", "=", hash(token)).executeTakeFirst() : undefined;
    const snapshot = async (visitorId: SalesVisitorsId): Promise<ClientResult<PublicSnapshot>> => {
        const { settings } = await readSettings(db);
        const lead = await db.selectFrom("sales_leads").select(["id", "application", "insights_subscribed_at"]).where("visitor_id", "=", visitorId).executeTakeFirst();
        const booking = lead ? await db.selectFrom("sales_call_slots").selectAll().where("booked_lead_id", "=", lead.id).executeTakeFirst() : undefined;
        const slots = await db.selectFrom("sales_call_slots").select(["id", "starts_at", "ends_at"]).where("starts_at", ">", new Date()).where("booked_lead_id", "is", null).orderBy("starts_at").limit(100).execute();
        return { ok: true, value: { settings: { ...settings, faqs: settings.faqs.filter(f => f.answer.trim() || f.videoUrl), stories: settings.stories.filter(s => s.published && s.consentConfirmed) }, identified: !!lead, subscribed: !!lead?.insights_subscribed_at, applied: !!lead && !!parseApplication(lead.application), booking: booking ? bookingRecord(booking) : null, slots: slots.map(s => ({ id: s.id, startsAt: s.starts_at.toISOString(), endsAt: s.ends_at.toISOString(), booked: false })) } };
    };
    return {
        visitor: (input: Readonly<{
            token: string;
            source: unknown;
        }>) => available(async (): Promise<ClientResult<Readonly<{
            id: string;
        }>>> => {
            const existing = await visitor(input.token);
            if (existing)
                return { ok: true, value: existing };
            if (!/^[a-zA-Z0-9_-]{43}$/.test(input.token))
                return failure("invalid_input", "Invalid visitor session.");
            const id = randomUUID() as SalesVisitorsId;
            await db.insertInto("sales_visitors").values({ id, token_hash: hash(input.token), source: isText(input.source, 300) ? input.source : "Direct" }).execute();
            return { ok: true, value: { id } };
        }),
        get: (input: Readonly<{
            token: string;
            page: unknown;
        }>) => available(async (): Promise<ClientResult<PublicSnapshot>> => {
            const v = await visitor(input.token);
            if (!v)
                return failure("forbidden", "Open the sales page again to continue.");
            if (!PUBLIC_PAGES.includes(input.page as PublicPage))
                return failure("invalid_input", "Unknown page.");
            // One first visit per page per visitor keeps refreshes from inflating the journey.
            await db.transaction().execute(async (tx) => {
                await tx.selectFrom("sales_visitors").select("id").where("id", "=", v.id).forUpdate().executeTakeFirstOrThrow();
                const existing = await tx.selectFrom("sales_events").select("id").where("visitor_id", "=", v.id).where("kind", "=", `view:${input.page}`).executeTakeFirst();
                if (!existing)
                    await recordEvent(tx, { visitorId: v.id, kind: `view:${input.page}` });
            });
            return snapshot(v.id);
        }),
        identify: (input: Readonly<{
            token: string;
            name: unknown;
            email: unknown;
            subscribe: unknown;
        }>) => available(async (): Promise<ClientResult<PublicSnapshot>> => {
            if (input.subscribe !== true || !isText(input.name, 300) || !input.name.trim() || !isText(input.email, 300) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim()))
                return failure("invalid_input", "Enter your name and a valid email address.");
            const v = await visitor(input.token);
            if (!v)
                return failure("forbidden", "Open the sales page again to continue.");
            await db.transaction().execute(async (tx) => {
                await tx.selectFrom("sales_visitors").select("id").where("id", "=", v.id).forUpdate().executeTakeFirstOrThrow();
                const existing = await tx.selectFrom("sales_leads").select(["id", "insights_subscribed_at"]).where("visitor_id", "=", v.id).executeTakeFirst();
                if (existing) {
                    if (existing.insights_subscribed_at)
                        return;
                    await tx.updateTable("sales_leads").set({ insights_subscribed_at: new Date(), insights_consent: "30 Days, 30 Insights from Elite Body System; unsubscribe at any time." }).where("id", "=", existing.id).execute();
                    await recordEvent(tx, { visitorId: v.id, kind: "insights_subscribed", detail: "30 Days, 30 Insights consent accepted" });
                    return;
                }
                await tx.insertInto("sales_leads").values({ id: randomUUID() as SalesLeadsId, visitor_id: v.id, name: (input.name as string).trim(), email: (input.email as string).trim().toLowerCase(), stage: "free_value", application: JSON.stringify({}), insights_subscribed_at: new Date(), insights_consent: "30 Days, 30 Insights from Elite Body System; unsubscribe at any time.", }).execute();
                await recordEvent(tx, { visitorId: v.id, kind: "free_value", detail: "Requested free value" });
            });
            return snapshot(v.id);
        }),
        unsubscribe: (input: Readonly<{
            token: string;
        }>) => available(async (): Promise<ClientResult<PublicSnapshot>> => {
            const v = await visitor(input.token);
            if (!v)
                return failure("forbidden", "Open the free value page again to continue.");
            await db.transaction().execute(async (tx) => {
                await tx.selectFrom("sales_visitors").select("id").where("id", "=", v.id).forUpdate().executeTakeFirstOrThrow();
                const changed = await tx.updateTable("sales_leads").set({ insights_subscribed_at: null }).where("visitor_id", "=", v.id).where("insights_subscribed_at", "is not", null).returning("id").executeTakeFirst();
                if (changed)
                    await recordEvent(tx, { visitorId: v.id, kind: "insights_unsubscribed", detail: "30 Days, 30 Insights signup withdrawn" });
            });
            return snapshot(v.id);
        }),
        apply: (input: Readonly<{
            token: string;
            application: unknown;
        }>) => available(async (): Promise<ClientResult<PublicSnapshot>> => {
            const application = parseApplication(input.application);
            if (!application)
                return failure("invalid_input", "Please complete every required question and check your email address.");
            const v = await visitor(input.token);
            if (!v)
                return failure("forbidden", "Open the application page again to continue.");
            await db.transaction().execute(async (tx) => {
                await tx.selectFrom("sales_visitors").select("id").where("id", "=", v.id).forUpdate().executeTakeFirstOrThrow();
                const lead = await tx.selectFrom("sales_leads").selectAll().where("visitor_id", "=", v.id).executeTakeFirst();
                if (lead && parseApplication(lead.application))
                    return;
                const data = { name: application.name, email: application.email.toLowerCase(), phone: application.phone, stage: "applied", application: JSON.stringify(application), updated_at: new Date() };
                if (lead)
                    await tx.updateTable("sales_leads").set({ ...data, revision: lead.revision + 1 }).where("id", "=", lead.id).execute();
                else
                    await tx.insertInto("sales_leads").values({ ...data, id: randomUUID() as SalesLeadsId, visitor_id: v.id }).execute();
                await recordEvent(tx, { visitorId: v.id, kind: "applied", detail: "Application submitted" });
            });
            return snapshot(v.id);
        }),
        book: (input: Readonly<{
            token: string;
            slotId: unknown;
        }>) => available(async (): Promise<ClientResult<PublicSnapshot>> => {
            if (!uuid(input.slotId))
                return failure("invalid_input", "Choose a call time.");
            const slotId = input.slotId as SalesCallSlotsId, v = await visitor(input.token);
            if (!v)
                return failure("forbidden", "Open the application page again to continue.");
            const result = await db.transaction().execute(async (tx) => {
                await tx.selectFrom("sales_visitors").select("id").where("id", "=", v.id).forUpdate().executeTakeFirstOrThrow();
                const lead = await tx.selectFrom("sales_leads").selectAll().where("visitor_id", "=", v.id).forUpdate().executeTakeFirst();
                if (!lead || !parseApplication(lead.application))
                    return failure("invalid_input", "Complete your application before booking a call.");
                const booked = await tx.selectFrom("sales_call_slots").select("id").where("booked_lead_id", "=", lead.id).executeTakeFirst();
                if (booked)
                    return { ok: true as const, value: null };
                if (lead.stage === "won" || lead.stage === "lost")
                    return failure("conflict", "Please contact Elite Body System to arrange another call.");
                // Serialize slot creation and reservations with the same transaction lock.
                await tx.selectFrom("sales_settings").select("id").where("id", "=", 1 as SalesSettingsId).forUpdate().executeTakeFirstOrThrow();
                const slot = await tx.selectFrom("sales_call_slots").selectAll().where("id", "=", slotId).forUpdate().executeTakeFirst();
                if (!slot || slot.booked_lead_id || slot.starts_at.getTime() <= Date.now())
                    return failure("conflict", "That time is no longer available. Refresh the page and choose another.");
                await tx.updateTable("sales_call_slots").set({ booked_lead_id: lead.id }).where("id", "=", slot.id).execute();
                await tx.updateTable("sales_leads").set({ stage: "call_booked", revision: lead.revision + 1, updated_at: new Date() }).where("id", "=", lead.id).execute();
                await recordEvent(tx, { visitorId: v.id, kind: "call_booked", detail: slot.starts_at.toISOString() });
                return { ok: true as const, value: null };
            });
            return result.ok ? snapshot(v.id) : result;
        }),
    };
}
export type PublicSales = ReturnType<typeof createPublicSales>;
