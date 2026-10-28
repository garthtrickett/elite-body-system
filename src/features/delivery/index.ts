import type { Auth } from "../auth/index.ts";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
import { mentorAccess, mentorClientScope, managerAccess } from "../access/index.ts";
import { createProgramming, parseWorkout, workoutStats } from "../training/index.ts";
import type { MentorCheckins } from "../checkins/index.ts";
import { parseAnswers } from "../onboarding/index.ts";
import { isRecord, isRevision, isText } from "../../shared/validation.ts";
import type { ClientResult } from "../../shared/client-result.ts";
import { createCoachingMessages } from "./messaging.ts";
import { guarded, fail, card, membership, memberName, thread, unreadCount, uuid } from "./storage.ts";
import type { Roster, ClientDetail, MemberRoom, Membership } from "./contracts.ts";
export function createDelivery(config: Readonly<{
    db: Kysely<Database>;
    checkins: MentorCheckins;
    auth: Pick<Auth, "provisionAccount">;
}>) {
    const db = config.db, programming = createProgramming({ db }), messages = createCoachingMessages({ db });
    return {
        ...messages,
        provisionMember: (input: Readonly<{
            actorId: string;
            email: unknown;
            level: unknown;
        }>) => guarded(async (): Promise<ClientResult<Readonly<{
            id: string;
        }>>> => {
            if (!await managerAccess({ db, actorId: input.actorId }) || !await mentorAccess({ db, actorId: input.actorId }))
                return fail("forbidden", "A business manager with mentor access must add members.");
            if (!["group", "individual"].includes(input.level as string))
                return fail("invalid_input", "Choose the confirmed coaching option.");
            const account = await config.auth.provisionAccount({ email: input.email });
            if (!account.ok)
                return fail(account.error.code === "invalid_input" ? "invalid_input" : "unavailable", "The member could not be added. Check the email address and try again.");
            const id = account.value.id as AccountsId;
            await db.transaction().execute(async (tx) => {
                await tx.selectFrom("accounts").select("id").where("id", "=", id).forUpdate().executeTakeFirstOrThrow();
                await tx.insertInto("coaching_memberships").values({ client_id: id, level: input.level as "group" | "individual", active: true, updated_by: input.actorId as AccountsId }).onConflict(c => c.column("client_id").doNothing()).execute();
                await tx.insertInto("mentor_clients").values({ mentor_id: input.actorId as AccountsId, client_id: id }).onConflict(c => c.columns(["mentor_id", "client_id"]).doNothing()).execute();
            });
            return { ok: true, value: { id } };
        }),
        clients: (input: Readonly<{
            actorId: string;
            search?: unknown;
            after?: unknown;
        }>) => guarded(async (): Promise<ClientResult<Roster>> => {
            if (!await mentorAccess({ db, actorId: input.actorId }))
                return fail("forbidden", "A Performance Mentor account is required.");
            if (input.search !== undefined && !isText(input.search, 100) || input.after !== undefined && !isText(input.after, 300))
                return fail("invalid_input", "Choose a valid client search or page.");
            let query = db.selectFrom("accounts as a").leftJoin("client_profiles as p", "p.account_id", "a.id").leftJoin("coaching_memberships as m", "m.client_id", "a.id").select(["a.id", "a.email", "p.data", "m.level", "m.active", "m.revision"])
                .select(unreadCount({ actorId: input.actorId, clientRef: "a.id", mentor: true }).as("unread"))
                .select(sql<Date | null> `(select max(c.week) from weekly_checkins as c where c.account_id=a.id and c.submitted_at is not null)`.as("last_checkin"))
                .select(sql<string> `(select count(*)::text from weekly_checkins as c left join weekly_checkin_reviews as r on r.account_id=c.account_id and r.week=c.week where c.account_id=a.id and c.submitted_at is not null and r.account_id is null)`.as("pending"))
                .where(mentorClientScope({ actorId: input.actorId, clientRef: "a.id" }));
            if (input.search) {
                const term = `%${(input.search as string).replace(/[\\%_]/g, "\\$&")}%`;
                query = query.where(e => e.or([e("a.email", "ilike", term), sql<boolean> `coalesce(p.data->>'name','') ilike ${term}`]));
            }
            if (input.after)
                query = query.where("a.email", ">", input.after as string);
            const rows = await query.orderBy("a.email").limit(51).execute(), shown = rows.slice(0, 50);
            return { ok: true, value: { clients: shown.map(r => ({ id: r.id, name: memberName(r.data, r.email), email: r.email, profileCompleted: isRecord(r.data) && r.data.completed === true, membership: r.level ? { level: r.level as "group" | "individual", active: r.active === true, revision: r.revision! } : null, lastCheckin: r.last_checkin ? (typeof r.last_checkin === "string" ? String(r.last_checkin).slice(0, 10) : r.last_checkin.toISOString().slice(0, 10)) : null, pendingCheckins: Number(r.pending), unread: Number(r.unread) })), nextCursor: rows.length > 50 ? shown.at(-1)?.email ?? null : null, canManageMembership: await managerAccess({ db, actorId: input.actorId }) } };
        }),
        client: (input: Readonly<{
            actorId: string;
            clientId: unknown;
        }>) => guarded(async (): Promise<ClientResult<ClientDetail>> => {
            if (!uuid(input.clientId))
                return fail("invalid_input", "Choose a client.");
            const clientId = input.clientId;
            if (!await mentorAccess({ db, actorId: input.actorId, clientId }))
                return fail("forbidden", "Coach access to this client is required.");
            const client = await card(db, { clientId, actorId: input.actorId });
            if (!client)
                return fail("not_found", "That client no longer exists.");
            const profile = await db.selectFrom("client_profiles").select("data").where("account_id", "=", clientId as AccountsId).executeTakeFirst(), p = isRecord(profile?.data) ? profile.data : {};
            const onboarding = await db.selectFrom("onboarding_records").select("data").where("account_id", "=", clientId as AccountsId).executeTakeFirst(), answers = onboarding ? parseAnswers(onboarding.data) : undefined;
            const candidate = answers?.ok && answers.value.routine.timezone ? answers.value.routine.timezone : isText(p.timezone, 100) && p.timezone ? p.timezone : "UTC";
            let timezone = "UTC";
            try {
                new Intl.DateTimeFormat("en", { timeZone: candidate });
                timezone = candidate;
            }
            catch { }
            const checkins = await config.checkins.history({ actorId: input.actorId, clientId });
            if (!checkins.ok)
                return checkins;
            const workouts = await db.selectFrom("workout_sessions").select("data").where("account_id", "=", clientId as AccountsId).orderBy("day", "desc").limit(16).execute();
            const summaries = workouts.map(r => {
                const workout = parseWorkout(r.data);
                if (!workout.ok)
                    throw new Error("Invalid workout");
                const stats = workoutStats({ workout: workout.value, history: [] });
                return { date: workout.value.date, finished: workout.value.finishedAt !== null, sets: stats.sets, volume: stats.volume };
            });
            const adjustmentResult = await programming.history({ accountId: clientId });
            if (!adjustmentResult.ok)
                return adjustmentResult;
            return { ok: true, value: { client, goals: answers?.ok ? answers.value.questionnaire.transformation : isText(p.firstGoal, 6000) ? p.firstGoal : "", equipment: answers?.ok ? answers.value.routine.equipment : isText(p.equipment, 6000) ? p.equipment : "", limitations: answers?.ok ? answers.value.healthDetails : isText(p.workaround, 6000) ? p.workaround : "", timezone, checkins: checkins.value.entries.map(e => e.entry), nextCheckinCursor: checkins.value.nextCursor, workouts: summaries, adjustments: adjustmentResult.value, thread: await thread(db, { clientId, actorId: input.actorId, mentor: true }) } };
        }),
        member: (input: Readonly<{
            actorId: string;
        }>) => guarded(async (): Promise<ClientResult<MemberRoom>> => {
            const adjustments = await programming.history({ accountId: input.actorId });
            if (!adjustments.ok)
                return adjustments;
            return { ok: true, value: { membership: await membership(db, input.actorId), thread: await thread(db, { clientId: input.actorId, actorId: input.actorId, mentor: false }), adjustments: adjustments.value, coachingName: "Elite Body System" } };
        }),
        setMembership: (input: Readonly<{
            actorId: string;
            clientId: unknown;
            level: unknown;
            active: unknown;
            revision: unknown;
        }>) => guarded(async (): Promise<ClientResult<Membership>> => {
            if (!uuid(input.clientId) || !["group", "individual"].includes(input.level as string) || typeof input.active !== "boolean" || !isRevision(input.revision))
                return fail("invalid_input", "Choose a coaching option and current membership revision.");
            if (!await managerAccess({ db, actorId: input.actorId }) || !await mentorAccess({ db, actorId: input.actorId, clientId: input.clientId }))
                return fail("forbidden", "A business manager with client access must assign coaching options.");
            return db.transaction().execute(async (tx) => {
                await tx.selectFrom("accounts").select("id").where("id", "=", input.clientId as AccountsId).forUpdate().executeTakeFirstOrThrow();
                const old = await tx.selectFrom("coaching_memberships").selectAll().where("client_id", "=", input.clientId as AccountsId).forUpdate().executeTakeFirst();
                if (old && old.level === input.level && old.active === input.active)
                    return { ok: true, value: { level: old.level as "group" | "individual", active: old.active, revision: old.revision } };
                if ((old?.revision ?? 0) !== input.revision)
                    return fail("conflict", "This membership changed. Refresh before editing it.");
                const level = input.level as "group" | "individual", active = input.active as boolean, revision = (old?.revision ?? 0) + 1;
                if (old)
                    await tx.updateTable("coaching_memberships").set({ level, active, revision, updated_by: input.actorId as AccountsId, updated_at: new Date() }).where("client_id", "=", old.client_id).execute();
                else
                    await tx.insertInto("coaching_memberships").values({ client_id: input.clientId as AccountsId, level, active, revision, updated_by: input.actorId as AccountsId }).execute();
                return { ok: true, value: { level, active, revision } };
            });
        }),
        adjust: programming.adjust,
    };
}
export type Delivery = ReturnType<typeof createDelivery>;
