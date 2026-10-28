import type { SalesSettingsId } from "../../platform/database/generated/public/SalesSettings.ts";
import { managerAccess } from "../access/index.ts";
import { randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
import type { SalesVisitorsId } from "../../platform/database/generated/public/SalesVisitors.ts";
import type { SalesEventsId } from "../../platform/database/generated/public/SalesEvents.ts";
import type { ClientResult } from "../../shared/client-result.ts";
import { DEFAULT_SETTINGS, parseSettings } from "./contracts.ts";
import type { Booking } from "./contracts.ts";
export type SalesDb = Kysely<Database> | Transaction<Database>;
export const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const failure = (code: "invalid_input" | "conflict" | "forbidden" | "not_found" | "unavailable", message: string) => ({ ok: false as const, error: { code, message } });
export async function available<T>(operation: () => Promise<ClientResult<T>>): Promise<ClientResult<T>> {
    try {
        return await operation();
    }
    catch {
        return failure("unavailable", "The sales system is unavailable. Please try again.");
    }
}
export async function managerAllowed(db: SalesDb, actorId: string): Promise<boolean> {
    return uuid(actorId) && await managerAccess({ db, actorId });
}
export async function readSettings(db: SalesDb) {
    const row = await db.selectFrom("sales_settings").selectAll().where("id", "=", 1 as SalesSettingsId).executeTakeFirst();
    const settings = row ? parseSettings(row.content) : DEFAULT_SETTINGS;
    if (!settings)
        throw new Error("Sales settings are invalid");
    return { settings, revision: row?.revision ?? 0 };
}
export async function recordEvent(db: SalesDb, input: Readonly<{
    visitorId: SalesVisitorsId;
    kind: string;
    detail?: string;
}>): Promise<void> {
    await db.insertInto("sales_events").values({ id: randomUUID() as SalesEventsId, visitor_id: input.visitorId, kind: input.kind, detail: input.detail ?? "" }).execute();
}
export const bookingRecord = (s: Readonly<{
    id: string;
    starts_at: Date;
    ends_at: Date;
    meeting_url: string;
}>): Booking => ({ id: s.id, startsAt: s.starts_at.toISOString(), endsAt: s.ends_at.toISOString(), meetingUrl: s.meeting_url });
