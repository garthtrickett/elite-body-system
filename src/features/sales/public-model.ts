import type { ClientResult } from "../../shared/client-result.ts";
import type { Application, PublicPage, PublicSnapshot } from "./contracts.ts";
export type PublicEffect = Readonly<{
    id: number;
    kind: "load" | "identify" | "apply" | "book" | "unsubscribe";
    body?: unknown;
}> | Readonly<{
    id: number;
    kind: "navigate";
    href: string;
}>;
export type PublicModel = Readonly<{
    page: PublicPage;
    snapshot: PublicSnapshot | null;
    form: Application;
    selectedSlot: string;
    consent: boolean;
    busy: boolean;
    error: string;
    pending: PublicEffect | undefined;
    serial: number;
    visibleStories: number;
}>;
export type PublicProposal = Readonly<{
    kind: "consent";
    value: boolean;
}> | Readonly<{
    kind: "started";
}> | Readonly<{
    kind: "field";
    key: keyof Application;
    value: string;
}> | Readonly<{
    kind: "slot";
    id: string;
}> | Readonly<{
    kind: "submit";
    action: "identify" | "apply" | "book" | "unsubscribe";
}> | Readonly<{
    kind: "finished";
    id: number;
    result: ClientResult<PublicSnapshot>;
}> | Readonly<{
    kind: "navigated";
    id: number;
}> | Readonly<{
    kind: "moreStories";
}>;
export const initialPublic = (page: PublicPage): PublicModel => ({ page, snapshot: null, form: { name: "", email: "", phone: "", age: "", role: "", goal: "", training: "", obstacle: "", invest: "" }, selectedSlot: "", consent: false, busy: false, error: "", pending: undefined, serial: 0, visibleStories: 6 });
function queue(m: PublicModel, e: Omit<Extract<PublicEffect, {
    kind: "load" | "identify" | "apply" | "book" | "unsubscribe";
}>, "id">): PublicModel { return { ...m, busy: true, error: "", serial: m.serial + 1, pending: { ...e, id: m.serial + 1 } }; }
export function acceptPublic(m: PublicModel, p: PublicProposal): PublicModel {
    if (p.kind === "started")
        return m.busy ? m : queue(m, { kind: "load" });
    if (p.kind === "field")
        return m.busy ? m : { ...m, form: { ...m.form, [p.key]: p.value } };
    if (p.kind === "consent")
        return { ...m, consent: p.value };
    if (p.kind === "slot")
        return m.busy ? m : { ...m, selectedSlot: p.id };
    if (p.kind === "moreStories")
        return { ...m, visibleStories: m.visibleStories + 6 };
    if (p.kind === "submit") {
        if (m.busy)
            return m;
        if (p.action === "book" && !m.selectedSlot)
            return { ...m, error: "Choose a call time." };
        return queue(m, { kind: p.action, body: p.action === "unsubscribe" ? {} : p.action === "apply" ? m.form : p.action === "identify" ? { name: m.form.name, email: m.form.email, subscribe: m.consent } : { slotId: m.selectedSlot } });
    }
    if (!m.pending || m.pending.id !== p.id || (m.pending.kind === "navigate") !== (p.kind === "navigated"))
        return m;
    if (p.kind === "navigated")
        return { ...m, busy: false, pending: undefined };
    if (!p.result.ok)
        return { ...m, busy: false, pending: undefined, error: p.result.error.message };
    const href = m.pending.kind === "apply" ? "/book-call" : m.pending.kind === "book" ? "/client-stories" : undefined;
    return { ...m, consent: m.pending.kind === "unsubscribe" ? false : m.consent, snapshot: p.result.value, selectedSlot: p.result.value.slots.some(slot => slot.id === m.selectedSlot) ? m.selectedSlot : "", busy: !!href, error: "", serial: href ? m.serial + 1 : m.serial, pending: href ? { id: m.serial + 1, kind: "navigate", href } : undefined };
}
