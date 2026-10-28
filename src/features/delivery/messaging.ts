import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
import type { CoachingMessagesId } from "../../platform/database/generated/public/CoachingMessages.ts";
import type { CoachingCommunityPostsId } from "../../platform/database/generated/public/CoachingCommunityPosts.ts";
import { mentorAccess } from "../access/index.ts";
import { isText } from "../../shared/validation.ts";
import { guarded, fail, membership, thread, uuid, memberName } from "./storage.ts";
import type { DeliveryDb } from "./storage.ts";
import type { ClientResult } from "../../shared/client-result.ts";
import type { Thread } from "./contracts.ts";
export function createCoachingMessages(config: Readonly<{
    db: DeliveryDb;
}>) {
    const db = config.db;
    async function send(input: Readonly<{
        actorId: string;
        clientId: unknown;
        requestId: unknown;
        body: unknown;
        mentor: boolean;
    }>): Promise<ClientResult<Readonly<{
        id: string;
    }>>> {
        return guarded(async () => {
            if (!uuid(input.clientId) || !uuid(input.requestId) || !isText(input.body, 6000) || !input.body.trim())
                return fail("invalid_input", "Write a message of up to 6,000 characters.");
            const clientId = input.clientId as AccountsId, body = input.body.trim();
            if (input.mentor ? !await mentorAccess({ db, actorId: input.actorId, clientId }) : input.actorId !== clientId)
                return fail("forbidden", "You do not have access to this conversation.");
            const existing = await db.selectFrom("coaching_messages").selectAll().where("request_id", "=", input.requestId).executeTakeFirst();
            if (existing)
                return existing.client_id === clientId && existing.sender_id === input.actorId && existing.body === body && existing.from_mentor === input.mentor ? { ok: true, value: { id: existing.id } } : fail("conflict", "This request belongs to another message.");
            const access = await membership(db, clientId);
            if (!access?.active || access.level !== "individual")
                return fail("forbidden", "Direct coaching messages require active individual access. Group members can use the community.");
            const recent = await db.selectFrom("coaching_messages").select(eb => eb.fn.countAll<string>().as("count")).where("sender_id", "=", input.actorId as AccountsId).where("created_at", ">", new Date(Date.now() - 60000)).executeTakeFirstOrThrow();
            if (Number(recent.count) >= 12)
                return fail("rate_limited", "Please wait a moment before sending another message.");
            const id = randomUUID() as CoachingMessagesId;
            const row = await db.insertInto("coaching_messages").values({ id, client_id: clientId, sender_id: input.actorId as AccountsId, request_id: input.requestId, body, from_mentor: input.mentor }).onConflict(c => c.column("request_id").doNothing()).returning("id").executeTakeFirst();
            if (row)
                return { ok: true, value: row };
            const repeated = await db.selectFrom("coaching_messages").selectAll().where("request_id", "=", input.requestId).executeTakeFirstOrThrow();
            return repeated.client_id === clientId && repeated.sender_id === input.actorId && repeated.body === body && repeated.from_mentor === input.mentor ? { ok: true, value: { id: repeated.id } } : fail("conflict", "This request belongs to another message.");
        });
    }
    return {
        sendMentor: (input: Readonly<{
            actorId: string;
            clientId: unknown;
            requestId: unknown;
            body: unknown;
        }>) => send({ ...input, mentor: true }),
        sendMember: (input: Readonly<{
            actorId: string;
            requestId: unknown;
            body: unknown;
        }>) => send({ ...input, clientId: input.actorId, mentor: false }),
        thread: (input: Readonly<{
            actorId: string;
            clientId: unknown;
            mentor: boolean;
            before?: unknown;
        }>) => guarded(async (): Promise<ClientResult<Thread>> => {
            if (!uuid(input.clientId) || input.before !== undefined && !uuid(input.before))
                return fail("invalid_input", "Choose a valid conversation page.");
            if (input.mentor ? !await mentorAccess({ db, actorId: input.actorId, clientId: input.clientId }) : input.actorId !== input.clientId)
                return fail("forbidden", "Conversation access is required.");
            return { ok: true, value: await thread(db, { clientId: input.clientId, actorId: input.actorId, mentor: input.mentor, ...(input.before ? { before: input.before as string } : {}) }) };
        }),
        read: (input: Readonly<{
            actorId: string;
            clientId: unknown;
            lastMessageId: unknown;
            mentor: boolean;
        }>) => guarded(async (): Promise<ClientResult<Readonly<{
            read: true;
        }>>> => {
            if (!uuid(input.clientId) || !uuid(input.lastMessageId))
                return fail("invalid_input", "Choose a valid conversation.");
            if (input.mentor ? !await mentorAccess({ db, actorId: input.actorId, clientId: input.clientId }) : input.actorId !== input.clientId)
                return fail("forbidden", "Conversation access is required.");
            const message = await db.selectFrom("coaching_messages").select("id").where("id", "=", input.lastMessageId as CoachingMessagesId).where("client_id", "=", input.clientId as AccountsId).executeTakeFirst();
            if (!message)
                return fail("not_found", "That message is unavailable.");
            await sql `insert into coaching_thread_reads (client_id,reader_id,last_message_id) values (${input.clientId}::uuid,${input.actorId}::uuid,${message.id}::uuid) on conflict (client_id,reader_id) do update set last_message_id=excluded.last_message_id where coaching_thread_reads.last_message_id is null or (select (fresh.created_at,fresh.id) >= (prior.created_at,prior.id) from coaching_messages as fresh cross join coaching_messages as prior where fresh.id=excluded.last_message_id and prior.id=coaching_thread_reads.last_message_id)`.execute(db);
            return { ok: true, value: { read: true } };
        }),
        community: (input: Readonly<{
            actorId: string;
            mentor: boolean;
            before?: unknown;
        }>) => guarded(async (): Promise<ClientResult<Thread>> => {
            if (input.before !== undefined && !uuid(input.before))
                return fail("invalid_input", "Choose a valid community page.");
            if (input.mentor ? !await mentorAccess({ db, actorId: input.actorId }) : !(await membership(db, input.actorId))?.active)
                return fail("forbidden", "An active EBS membership is required for the community.");
            let query = db.selectFrom("coaching_community_posts as m").leftJoin("client_profiles as p", "p.account_id", "m.author_id").selectAll("m").select("p.data");
            if (input.before) {
                const cursor = await db.selectFrom("coaching_community_posts").selectAll().where("id", "=", input.before as CoachingCommunityPostsId).executeTakeFirst();
                if (!cursor)
                    return fail("not_found", "That community page no longer exists.");
                query = query.where(sql<boolean> `(m.created_at,m.id) < (select page.created_at,page.id from coaching_community_posts as page where page.id=${cursor.id}::uuid)`);
            }
            const rows = await query.orderBy("m.created_at", "desc").orderBy("m.id", "desc").limit(51).execute(), shown = rows.slice(0, 50);
            return { ok: true, value: { messages: [...shown].reverse().map(r => ({ id: r.id, body: r.body, author: memberName(r.data, r.from_mentor ? "EBS Mentor" : "Member"), fromMentor: r.from_mentor, own: r.author_id === input.actorId && r.from_mentor === input.mentor, createdAt: r.created_at.toISOString() })), nextCursor: rows.length > 50 ? shown.at(-1)?.id ?? null : null } };
        }),
        post: (input: Readonly<{
            actorId: string;
            mentor: boolean;
            requestId: unknown;
            body: unknown;
        }>) => guarded(async (): Promise<ClientResult<Readonly<{
            id: string;
        }>>> => {
            if (!uuid(input.requestId) || !isText(input.body, 6000) || !input.body.trim())
                return fail("invalid_input", "Write a post of up to 6,000 characters.");
            if (input.mentor ? !await mentorAccess({ db, actorId: input.actorId }) : !(await membership(db, input.actorId))?.active)
                return fail("forbidden", "An active EBS membership is required for the community.");
            const existing = await db.selectFrom("coaching_community_posts").selectAll().where("request_id", "=", input.requestId).executeTakeFirst();
            if (existing)
                return existing.author_id === input.actorId && existing.body === input.body.trim() && existing.from_mentor === input.mentor ? { ok: true, value: { id: existing.id } } : fail("conflict", "This request belongs to another post.");
            const recent = await db.selectFrom("coaching_community_posts").select(eb => eb.fn.countAll<string>().as("count")).where("author_id", "=", input.actorId as AccountsId).where("created_at", ">", new Date(Date.now() - 60000)).executeTakeFirstOrThrow();
            if (Number(recent.count) >= 6)
                return fail("rate_limited", "Please wait a moment before posting again.");
            const id = randomUUID() as CoachingCommunityPostsId;
            const row = await db.insertInto("coaching_community_posts").values({ id, author_id: input.actorId as AccountsId, request_id: input.requestId, body: input.body.trim(), from_mentor: input.mentor }).onConflict(c => c.column("request_id").doNothing()).returning("id").executeTakeFirst();
            if (row)
                return { ok: true, value: row };
            const repeated = await db.selectFrom("coaching_community_posts").selectAll().where("request_id", "=", input.requestId).executeTakeFirstOrThrow();
            return repeated.author_id === input.actorId && repeated.body === input.body.trim() && repeated.from_mentor === input.mentor ? { ok: true, value: { id: repeated.id } } : fail("conflict", "This request belongs to another post.");
        }),
    };
}
