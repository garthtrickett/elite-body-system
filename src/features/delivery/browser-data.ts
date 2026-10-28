import { isRecord, isText, isDay, isRevision } from "../../shared/validation.ts";
import { parseEntry } from "../checkins/browser.ts";
import { parseProgramAdjustment } from "../training/browser.ts";
import type { Roster, ClientCard, ClientDetail, Membership, Thread, MemberRoom } from "./contracts.ts";
export function parseMembership(value: unknown): Membership | undefined {
    if (isRecord(value) && (value.level === "group" || value.level === "individual") && typeof value.active === "boolean" && isRevision(value.revision))
        return { level: value.level, active: value.active, revision: value.revision };
}
function parseClient(v: unknown): ClientCard | undefined {
    if (!isRecord(v) || !isText(v.id, 80) || !isText(v.name, 300) || !isText(v.email, 300) || typeof v.profileCompleted !== "boolean" || !(v.lastCheckin === null || isDay(v.lastCheckin)) || !isRevision(v.pendingCheckins) || !isRevision(v.unread))
        return;
    const membership = v.membership === null ? null : parseMembership(v.membership);
    if (membership === undefined)
        return;
    return { id: v.id, name: v.name, email: v.email, membership, profileCompleted: v.profileCompleted, lastCheckin: v.lastCheckin, pendingCheckins: v.pendingCheckins, unread: v.unread };
}
export function parseRoster(v: unknown): Roster | undefined {
    if (!isRecord(v) || !Array.isArray(v.clients) || !(v.nextCursor === null || isText(v.nextCursor, 300)) || typeof v.canManageMembership !== "boolean")
        return;
    const clients: ClientCard[] = [];
    for (const c of v.clients) {
        const client = parseClient(c);
        if (!client)
            return;
        clients.push(client);
    }
    return { clients, nextCursor: v.nextCursor, canManageMembership: v.canManageMembership };
}
export function parseThread(v: unknown): Thread | undefined {
    if (!isRecord(v) || !Array.isArray(v.messages) || v.messages.length > 50 || !(v.nextCursor === null || isText(v.nextCursor, 80)))
        return;
    const messages: Thread["messages"][number][] = [];
    for (const m of v.messages) {
        if (!isRecord(m) || !isText(m.id, 80) || !isText(m.body, 6000) || !isText(m.author, 300) || typeof m.fromMentor !== "boolean" || typeof m.own !== "boolean" || !isText(m.createdAt, 80) || !Number.isFinite(Date.parse(m.createdAt)))
            return;
        messages.push({ id: m.id, body: m.body, author: m.author, fromMentor: m.fromMentor, own: m.own, createdAt: m.createdAt });
    }
    return { messages, nextCursor: v.nextCursor };
}
export function parseDetail(v: unknown): ClientDetail | undefined {
    if (!isRecord(v) || (!Array.isArray(v.intake) || v.intake.length > 20 || v.intake.some(x => !isRecord(x) || !isText(x.label, 1000) || !isText(x.value, 6000))) || !isText(v.goals, 6000) || !isText(v.equipment, 6000) || !isText(v.limitations, 6000) || !isText(v.timezone, 100) || !Array.isArray(v.checkins) || !Array.isArray(v.workouts) || !Array.isArray(v.adjustments) || !(v.nextCheckinCursor === null || isDay(v.nextCheckinCursor)))
        return;
    const client = parseClient(v.client), thread = parseThread(v.thread);
    if (!client || !thread)
        return;
    const checkins: ClientDetail["checkins"][number][] = [], workouts: ClientDetail["workouts"][number][] = [], adjustments: ClientDetail["adjustments"][number][] = [];
    for (const x of v.checkins) {
        const e = parseEntry(x);
        if (!e)
            return;
        checkins.push(e);
    }
    for (const x of v.adjustments) {
        const a = parseProgramAdjustment(x);
        if (!a)
            return;
        adjustments.push(a);
    }
    for (const w of v.workouts) {
        if (!isRecord(w) || !isDay(w.date) || typeof w.finished !== "boolean" || !isRevision(w.sets) || typeof w.volume !== "number" || !Number.isFinite(w.volume))
            return;
        workouts.push({ date: w.date, finished: w.finished, sets: w.sets, volume: w.volume });
    }
    return { client, thread, checkins, workouts, adjustments, intake: (v.intake as readonly Readonly<{
            label: string;
            value: string;
        }>[]).map(x => ({ label: x.label, value: x.value })), goals: v.goals, equipment: v.equipment, limitations: v.limitations, timezone: v.timezone, nextCheckinCursor: v.nextCheckinCursor };
}
export function parseMember(v: unknown): MemberRoom | undefined {
    if (!isRecord(v) || !Array.isArray(v.adjustments) || !isText(v.coachingName, 300))
        return;
    const membership = v.membership === null ? null : parseMembership(v.membership), thread = parseThread(v.thread);
    if (membership === undefined || !thread)
        return;
    const adjustments: MemberRoom["adjustments"][number][] = [];
    for (const x of v.adjustments) {
        const a = parseProgramAdjustment(x);
        if (!a)
            return;
        adjustments.push(a);
    }
    return { membership, thread, adjustments, coachingName: v.coachingName };
}
