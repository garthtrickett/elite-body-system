import type { MentorHistory } from "../checkins/browser.ts";
import type { ClientResult } from "../../shared/client-result.ts";
import type { NavigationGuard } from "../../shared/browser-route.ts";
import { parseProgramRules } from "../training/browser.ts";
import type { Roster, ClientDetail, MemberRoom, Thread, Membership } from "./contracts.ts";
export type DeliveryTab = "clients" | "overview" | "messages" | "progress" | "programming" | "community" | "checkins";
export type ProgramDraft = Readonly<{
    title: string;
    instructions: string;
    effectiveFrom: string;
    planKey: number;
    rules: Readonly<Record<string, Readonly<Record<string, string>>>>;
}>;
export type DeliveryEffect = Readonly<{
    id: number;
    kind: "olderCheckins";
    clientId: string;
    before: string;
}> | Readonly<{
    id: number;
    kind: "roster";
    search: string;
    after: string;
}> | Readonly<{
    id: number;
    kind: "client";
    clientId: string;
}> | Readonly<{
    id: number;
    kind: "member";
}> | Readonly<{
    id: number;
    kind: "community";
    before: string;
}> | Readonly<{
    id: number;
    kind: "olderThread";
    clientId: string;
    before: string;
}> | Readonly<{
    id: number;
    kind: "write";
    path: string;
    body: unknown;
    refresh: "client" | "member" | "community" | "roster";
    clear: "message" | "program" | "membership" | "newClient";
}> | Readonly<{
    id: number;
    kind: "read";
    clientId: string;
    messageId: string;
}> | Readonly<{
    id: number;
    kind: "mountCheckins";
}>;
export type DeliveryModel = Readonly<{
    mentor: boolean;
    tab: DeliveryTab;
    roster: Roster | null;
    detail: ClientDetail | null;
    member: MemberRoom | null;
    community: Thread | null;
    selected: string;
    search: string;
    after: string;
    newClientEmail: string;
    newClientLevel: "group" | "individual";
    message: string;
    program: ProgramDraft;
    programDirty: boolean;
    membership: Membership;
    membershipDirty: boolean;
    serial: number;
    pending: DeliveryEffect | undefined;
    retry: Extract<DeliveryEffect, {
        kind: "write";
    }> | undefined;
    error: string;
    notice: string;
    lastRead: string;
}>;
export type DeliveryProposal = Readonly<{
    kind: "newClient";
    email: string;
    level: "group" | "individual";
}> | Readonly<{
    kind: "addClient";
}> | Readonly<{
    kind: "blocked";
    message: string;
}> | Readonly<{
    kind: "olderCheckins";
}> | Readonly<{
    kind: "historyLoaded";
    id: number;
    result: ClientResult<MentorHistory>;
}> | Readonly<{
    kind: "started";
}> | Readonly<{
    kind: "tab";
    tab: DeliveryTab;
}> | Readonly<{
    kind: "select";
    clientId: string;
}> | Readonly<{
    kind: "search";
    value: string;
    after?: string;
}> | Readonly<{
    kind: "message";
    value: string;
}> | Readonly<{
    kind: "programField";
    field: "title" | "instructions" | "effectiveFrom" | "planKey";
    value: string;
}> | Readonly<{
    kind: "rule";
    id: string;
    field: string;
    value: string;
}> | Readonly<{
    kind: "membership";
    level: "group" | "individual";
    active: boolean;
}> | Readonly<{
    kind: "send";
    requestId: string;
}> | Readonly<{
    kind: "saveProgram";
    requestId: string;
}> | Readonly<{
    kind: "saveMembership";
}> | Readonly<{
    kind: "retry";
}> | Readonly<{
    kind: "clear";
}> | Readonly<{
    kind: "older";
}> | Readonly<{
    kind: "rosterLoaded";
    id: number;
    result: ClientResult<Roster>;
}> | Readonly<{
    kind: "clientLoaded";
    id: number;
    result: ClientResult<ClientDetail>;
    today: string;
}> | Readonly<{
    kind: "memberLoaded";
    id: number;
    result: ClientResult<MemberRoom>;
}> | Readonly<{
    kind: "threadLoaded";
    id: number;
    result: ClientResult<Thread>;
}> | Readonly<{
    kind: "written";
    id: number;
    result: ClientResult<Readonly<{
        acknowledged: true;
    }>>;
}> | Readonly<{
    kind: "read";
    id: number;
    accepted: boolean;
}> | Readonly<{
    kind: "checkinsMounted";
    id: number;
}>;
const emptyProgram = (day: string): ProgramDraft => ({ title: "", instructions: "", effectiveFrom: day, planKey: 0, rules: {} });
export function initialDelivery(input: Readonly<{
    mentor: boolean;
    tab?: DeliveryTab;
    today: string;
}>): DeliveryModel { return { mentor: input.mentor, tab: input.tab ?? (input.mentor ? "clients" : "messages"), roster: null, detail: null, member: null, community: null, selected: "", search: "", after: "", newClientEmail: "", newClientLevel: "group", message: "", program: emptyProgram(input.today), programDirty: false, membership: { level: "group", active: true, revision: 0 }, membershipDirty: false, serial: 0, pending: undefined, retry: undefined, error: "", notice: "", lastRead: "" }; }
type Intent = Omit<Extract<DeliveryEffect, {
    kind: "olderCheckins";
}>, "id"> | Omit<Extract<DeliveryEffect, {
    kind: "roster";
}>, "id"> | Omit<Extract<DeliveryEffect, {
    kind: "client";
}>, "id"> | Omit<Extract<DeliveryEffect, {
    kind: "member";
}>, "id"> | Omit<Extract<DeliveryEffect, {
    kind: "community";
}>, "id"> | Omit<Extract<DeliveryEffect, {
    kind: "olderThread";
}>, "id"> | Omit<Extract<DeliveryEffect, {
    kind: "write";
}>, "id"> | Omit<Extract<DeliveryEffect, {
    kind: "read";
}>, "id"> | Omit<Extract<DeliveryEffect, {
    kind: "mountCheckins";
}>, "id">;
function queue(m: DeliveryModel, e: Intent): DeliveryModel { return { ...m, serial: m.serial + 1, pending: { ...e, id: m.serial + 1 }, error: "" }; }
const dirty = (m: DeliveryModel) => !!m.newClientEmail.trim() || !!m.message.trim() || m.programDirty || m.membershipDirty;
function refresh(m: DeliveryModel): DeliveryModel {
    if (!m.mentor && !m.member)
        return queue(m, { kind: "member" });
    return m.tab === "community" ? queue(m, { kind: "community", before: "" }) : !m.mentor ? queue(m, { kind: "member" }) : m.tab === "checkins" ? queue(m, { kind: "mountCheckins" }) : m.selected && m.tab !== "clients" ? queue(m, { kind: "client", clientId: m.selected }) : queue(m, { kind: "roster", search: m.search, after: m.after });
}
function maybeRead(m: DeliveryModel): DeliveryModel { const thread = m.mentor ? m.detail?.thread : m.member?.thread, last = thread?.messages.at(-1); return m.tab === "messages" && last && last.id !== m.lastRead ? queue(m, { kind: "read", clientId: m.selected, messageId: last.id }) : m; }
export function acceptDelivery(m: DeliveryModel, p: DeliveryProposal): DeliveryModel {
    if (p.kind === "newClient")
        return m.pending || m.retry ? m : { ...m, newClientEmail: p.email, newClientLevel: p.level, notice: "" };
    if (p.kind === "addClient")
        return m.pending || m.retry ? m : queue(m, { kind: "write", path: "members", body: { email: m.newClientEmail, level: m.newClientLevel }, refresh: "roster", clear: "newClient" });
    if (p.kind === "blocked")
        return { ...m, error: p.message };
    if (p.kind === "message")
        return m.pending || m.retry ? m : { ...m, message: p.value, notice: "" };
    if (p.kind === "programField") {
        if (m.pending || m.retry)
            return m;
        if (p.field === "planKey") {
            const planKey = Number(p.value), existing = m.detail?.adjustments.find(a => a.planKey === planKey && a.effectiveFrom <= m.program.effectiveFrom)?.rules ?? {};
            return { ...m, program: { ...m.program, planKey, rules: Object.fromEntries(Object.entries(existing).map(([id, r]) => [id, Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]))])) }, programDirty: true, notice: "" };
        }
        return { ...m, program: { ...m.program, [p.field]: p.value }, programDirty: true, notice: "" };
    }
    if (p.kind === "rule")
        return m.pending || m.retry ? m : { ...m, program: { ...m.program, rules: { ...m.program.rules, [p.id]: { ...m.program.rules[p.id], [p.field]: p.value } } }, programDirty: true, notice: "" };
    if (p.kind === "membership")
        return m.pending || m.retry ? m : { ...m, membership: { ...m.membership, level: p.level, active: p.active }, membershipDirty: true, notice: "" };
    if (p.kind === "clear")
        return m.pending || m.retry ? m : { ...m, newClientEmail: "", message: "", program: emptyProgram(m.program.effectiveFrom), programDirty: false, membership: m.detail?.client.membership ?? { level: "group", active: true, revision: 0 }, membershipDirty: false, error: "", notice: "" };
    if (p.kind === "retry")
        return m.pending || !m.retry ? m : queue(m, m.retry);
    if (p.kind === "started")
        return m.pending || m.retry || dirty(m) ? m : refresh(m);
    if (p.kind === "send") {
        if (m.pending || m.retry)
            return m;
        if (!m.message.trim())
            return { ...m, error: "Write your message first." };
        return queue(m, { kind: "write", path: m.tab === "community" ? "community/post" : "messages/send", body: { ...(m.mentor ? { clientId: m.selected } : {}), requestId: p.requestId, body: m.message }, refresh: m.tab === "community" ? "community" : m.mentor ? "client" : "member", clear: "message" });
    }
    if (p.kind === "saveMembership")
        return m.pending || m.retry || !m.selected ? m : queue(m, { kind: "write", path: "membership", body: { clientId: m.selected, ...m.membership }, refresh: "client", clear: "membership" });
    if (p.kind === "saveProgram") {
        if (m.pending || m.retry || !m.selected)
            return m;
        const raw = Object.fromEntries(Object.entries(m.program.rules).map(([id, r]) => [id, Object.fromEntries(Object.entries(r).filter(([, v]) => v !== "").map(([key, value]) => [key, ["sets", "rest", "target"].includes(key) ? Number(value) : value]))]));
        const rules = m.program.planKey === 0 ? {} : parseProgramRules({ planKey: m.program.planKey, value: raw });
        if (!rules)
            return { ...m, error: "Check the sets, reps, rest and targets before saving." };
        return queue(m, { kind: "write", path: "programming", body: { clientId: m.selected, requestId: p.requestId, title: m.program.title, instructions: m.program.instructions, effectiveFrom: m.program.effectiveFrom, planKey: m.program.planKey || null, rules }, refresh: "client", clear: "program" });
    }
    if (p.kind === "olderCheckins")
        return m.pending || m.retry || !m.detail?.nextCheckinCursor ? m : queue(m, { kind: "olderCheckins", clientId: m.selected, before: m.detail.nextCheckinCursor });
    if (p.kind === "older") {
        if (m.pending || m.retry)
            return m;
        const t = m.tab === "community" ? m.community : m.mentor ? m.detail?.thread : m.member?.thread;
        if (!t?.nextCursor)
            return m;
        return m.tab === "community" ? queue(m, { kind: "community", before: t.nextCursor }) : queue(m, { kind: "olderThread", clientId: m.selected, before: t.nextCursor });
    }
    if (p.kind === "tab" || p.kind === "select" || p.kind === "search") {
        if (m.pending || m.retry)
            return m;
        if (dirty(m))
            return { ...m, error: "Send, save or clear your draft before changing views." };
        if (p.kind === "select")
            return queue({ ...m, selected: p.clientId, tab: "overview", detail: null, lastRead: "" }, { kind: "client", clientId: p.clientId });
        if (p.kind === "search")
            return queue({ ...m, search: p.value, after: p.after ?? "" }, { kind: "roster", search: p.value, after: p.after ?? "" });
        if (p.tab === "checkins")
            return queue({ ...m, tab: p.tab }, { kind: "mountCheckins" });
        if (p.tab === "community")
            return queue({ ...m, tab: p.tab }, { kind: "community", before: "" });
        if (p.tab === "clients")
            return queue({ ...m, tab: p.tab }, { kind: "roster", search: m.search, after: m.after });
        return maybeRead({ ...m, tab: p.tab, error: "" });
    }
    if (!m.pending || m.pending.id !== p.id)
        return m;
    const replies: Readonly<Record<DeliveryEffect["kind"], DeliveryProposal["kind"]>> = { roster: "rosterLoaded", client: "clientLoaded", member: "memberLoaded", community: "threadLoaded", olderThread: "threadLoaded", write: "written", read: "read", mountCheckins: "checkinsMounted", olderCheckins: "historyLoaded" };
    if (replies[m.pending.kind] !== p.kind)
        return m;
    if (p.kind === "checkinsMounted")
        return { ...m, pending: undefined };
    if (p.kind === "read") {
        if (!p.accepted)
            return { ...m, pending: undefined };
        const lastRead = m.pending.kind === "read" ? m.pending.messageId : m.lastRead;
        return { ...m, lastRead, pending: undefined, detail: m.detail ? { ...m.detail, client: { ...m.detail.client, unread: 0 } } : null };
    }
    if (p.kind === "written") {
        if (m.pending.kind !== "write")
            return m;
        if (!p.result.ok)
            return { ...m, pending: undefined, retry: p.result.error.code === "unavailable" ? m.pending : undefined, error: p.result.error.message };
        const next = { ...m, pending: undefined, retry: undefined, newClientEmail: m.pending.clear === "newClient" ? "" : m.newClientEmail, message: m.pending.clear === "message" ? "" : m.message, programDirty: m.pending.clear === "program" ? false : m.programDirty, membershipDirty: m.pending.clear === "membership" ? false : m.membershipDirty, notice: m.pending.clear === "message" ? "Sent." : "Saved." };
        return m.pending.refresh === "roster" ? queue({ ...next, tab: "clients", after: "", search: "" }, { kind: "roster", search: "", after: "" }) : m.pending.refresh === "community" ? queue(next, { kind: "community", before: "" }) : m.pending.refresh === "client" ? queue(next, { kind: "client", clientId: m.selected }) : queue(next, { kind: "member" });
    }
    if (!p.result.ok)
        return { ...m, pending: undefined, error: p.result.error.message };
    if (p.kind === "historyLoaded") {
        if (!m.detail)
            return { ...m, pending: undefined };
        const rows = p.result.value.entries.map(e => e.entry);
        return { ...m, pending: undefined, detail: { ...m.detail, checkins: [...m.detail.checkins, ...rows.filter(e => !m.detail!.checkins.some(prior => prior.week === e.week))], nextCheckinCursor: p.result.value.nextCursor } };
    }
    if (p.kind === "rosterLoaded")
        return { ...m, pending: undefined, roster: p.result.value };
    if (p.kind === "clientLoaded")
        return maybeRead({ ...m, pending: undefined, detail: m.detail?.client.id === p.result.value.client.id && m.tab === "progress" ? { ...p.result.value, checkins: [...p.result.value.checkins, ...m.detail.checkins.filter(e => !p.result.ok || !p.result.value.checkins.some(latest => latest.week === e.week))] } : p.result.value, membership: p.result.value.client.membership ?? { level: "group", active: true, revision: 0 }, program: m.programDirty ? m.program : emptyProgram(p.today) });
    if (p.kind === "memberLoaded") {
        const next = { ...m, pending: undefined, member: p.result.value };
        return m.tab === "community" && p.result.value.membership?.active ? queue(next, { kind: "community", before: "" }) : maybeRead(next);
    }
    if (p.kind === "threadLoaded") {
        const received = p.result.value;
        if (m.pending.kind === "community") {
            const previous = m.pending.before ? m.community?.messages ?? [] : [];
            return { ...m, pending: undefined, community: { messages: [...received.messages, ...previous.filter(x => !received.messages.some(y => y.id === x.id))], nextCursor: received.nextCursor } };
        }
        if (m.pending.kind === "olderThread") {
            const prior = m.mentor ? m.detail?.thread : m.member?.thread, thread = { messages: [...received.messages, ...(prior?.messages ?? []).filter(x => !received.messages.some(y => y.id === x.id))], nextCursor: received.nextCursor };
            return { ...m, pending: undefined, detail: m.detail ? { ...m.detail, thread } : null, member: m.member ? { ...m.member, thread } : null };
        }
    }
    return m;
}
export function deliveryNavigation(m: DeliveryModel): NavigationGuard { return m.retry || m.pending?.kind === "write" ? { kind: "blocked", message: "Resolve the last send or save before leaving. Retry uses the same request and will not send a duplicate." } : dirty(m) ? { kind: "confirm", message: "Leave this page? Your unsent message or unsaved adjustments will be lost." } : { kind: "ready" }; }
