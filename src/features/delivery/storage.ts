import { sql } from "kysely";
import type { Kysely } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
import type { ClientResult } from "../../shared/client-result.ts";
import { isRecord, isText } from "../../shared/validation.ts";
import type { Membership, ClientCard, Thread } from "./contracts.ts";
import type { CoachingMessagesId } from "../../platform/database/generated/public/CoachingMessages.ts";
export type DeliveryDb = Kysely<Database>;
export const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export const fail = (code: "invalid_input" | "forbidden" | "not_found" | "unavailable" | "conflict" | "rate_limited", message: string) => ({ ok: false as const, error: { code, message } });
export const guarded = async <T>(fn: () => Promise<ClientResult<T>>): Promise<ClientResult<T>> => {
    try {
        return await fn();
    }
    catch {
        return fail("unavailable", "Your coaching workspace could not be loaded or saved. Try again.");
    }
};
export const memberName = (profile: unknown, fallback: string) => isRecord(profile) && isText(profile.name, 300) && profile.name.trim() ? profile.name.trim() : fallback;
export async function membership(db: DeliveryDb, clientId: string): Promise<Membership | null> { const row = await db.selectFrom("coaching_memberships").selectAll().where("client_id", "=", clientId as AccountsId).executeTakeFirst(); return row ? { level: row.level as "group" | "individual", active: row.active, revision: row.revision } : null; }
export function unreadCount(input: Readonly<{
    actorId: string;
    clientRef: string;
    mentor: boolean;
}>) {
    const client = sql.ref(input.clientRef);
    return sql<string> `(select count(*)::text from coaching_messages as unread_message where unread_message.client_id = ${client} and unread_message.from_mentor = ${!input.mentor} and not exists (select 1 from coaching_thread_reads as read_state join coaching_messages as read_message on read_message.id = read_state.last_message_id where read_state.client_id = ${client} and read_state.reader_id = ${input.actorId}::uuid and (read_message.created_at, read_message.id) >= (unread_message.created_at, unread_message.id)))`;
}
export async function card(db: DeliveryDb, input: Readonly<{
    clientId: string;
    actorId: string;
}>): Promise<ClientCard | undefined> {
    const row = await db.selectFrom("accounts as a").leftJoin("client_profiles as p", "p.account_id", "a.id").select(["a.id", "a.email", "p.data"]).select(unreadCount({ actorId: input.actorId, clientRef: "a.id", mentor: true }).as("unread")).where("a.id", "=", input.clientId as AccountsId).executeTakeFirst();
    if (!row)
        return;
    const last = await db.selectFrom("weekly_checkins").select("week").where("account_id", "=", row.id).where("submitted_at", "is not", null).orderBy("week", "desc").executeTakeFirst();
    const pending = await db.selectFrom("weekly_checkins as c").leftJoin("weekly_checkin_reviews as r", j => j.onRef("r.account_id", "=", "c.account_id").onRef("r.week", "=", "c.week")).select(eb => eb.fn.countAll<string>().as("count")).where("c.account_id", "=", row.id).where("c.submitted_at", "is not", null).where("r.account_id", "is", null).executeTakeFirstOrThrow();
    return { id: row.id, email: row.email, name: memberName(row.data, row.email), profileCompleted: isRecord(row.data) && row.data.completed === true, membership: await membership(db, row.id), lastCheckin: last?.week.toISOString().slice(0, 10) ?? null, pendingCheckins: Number(pending.count), unread: Number(row.unread) };
}
export async function thread(db: DeliveryDb, input: Readonly<{
    clientId: string;
    actorId: string;
    mentor: boolean;
    before?: string;
}>): Promise<Thread> {
    let query = db.selectFrom("coaching_messages as m").leftJoin("client_profiles as p", "p.account_id", "m.sender_id").selectAll("m").select("p.data").where("m.client_id", "=", input.clientId as AccountsId);
    if (input.before) {
        const cursor = await db.selectFrom("coaching_messages").select(["id", "created_at"]).where("id", "=", input.before as CoachingMessagesId).where("client_id", "=", input.clientId as AccountsId).executeTakeFirst();
        if (!cursor)
            throw new Error("Unknown thread page");
        query = query.where(sql<boolean> `(m.created_at,m.id) < (select page.created_at,page.id from coaching_messages as page where page.id=${cursor.id}::uuid)`);
    }
    const rows = await query.orderBy("m.created_at", "desc").orderBy("m.id", "desc").limit(51).execute(), shown = rows.slice(0, 50);
    return { messages: [...shown].reverse().map(r => ({ id: r.id, body: r.body, author: memberName(r.data, r.from_mentor ? "EBS Mentor" : "Member"), fromMentor: r.from_mentor, own: r.sender_id === input.actorId && r.from_mentor === input.mentor, createdAt: r.created_at.toISOString() })), nextCursor: rows.length > 50 ? shown.at(-1)?.id ?? null : null };
}
