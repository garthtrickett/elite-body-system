import type { ClientResult } from "../../shared/client-result.ts";
import type { NavigationGuard } from "../../shared/browser-route.ts";
import type { ManagementSnapshot, SalesSettings, JourneyEvent, Stage } from "./contracts.ts";
export type Area = "marketing" | "sales" | "system";
export type Editor = "overview" | "free" | "application" | "booking" | "stories";
export type ManagementEffect = Readonly<{
    id: number;
    kind: "confirmCancel";
    leadId: string;
    revision: number;
}> | Readonly<{
    id: number;
    kind: "confirmDiscard";
}> | Readonly<{
    id: number;
    kind: "load";
    before: string;
    search: string;
}> | Readonly<{
    id: number;
    kind: "write";
    path: string;
    body: unknown;
}> | Readonly<{
    id: number;
    kind: "journey";
    leadId: string;
}> | Readonly<{
    id: number;
    kind: "workspace";
    view: "coaching" | "client" | "marketing";
}>;
export type ManagementModel = Readonly<{
    area: Area;
    salesMode: "pipeline" | "pages" | "script";
    editor: Editor;
    snapshot: ManagementSnapshot | null;
    draft: SalesSettings | null;
    dirty: boolean;
    selected: string;
    leadStage: Stage;
    leadNotes: string;
    leadDirty: boolean;
    events: readonly JourneyEvent[];
    search: string;
    before: string;
    systemView: "coaching" | "client";
    pending: ManagementEffect | undefined;
    serial: number;
    error: string;
    notice: string;
}>;
export type ManagementProposal = Readonly<{
    kind: "workspaceBlocked";
    message: string;
}> | Readonly<{
    kind: "cancelBooking";
}> | Readonly<{
    kind: "cancelConfirmed";
    id: number;
    accepted: boolean;
}> | Readonly<{
    kind: "discard";
}> | Readonly<{
    kind: "discardConfirmed";
    id: number;
    accepted: boolean;
}> | Readonly<{
    kind: "started";
}> | Readonly<{
    kind: "editor";
    editor: Editor;
}> | Readonly<{
    kind: "settingsEdited";
    settings: SalesSettings;
}> | Readonly<{
    kind: "saveSettings";
}> | Readonly<{
    kind: "selectLead";
    id: string;
}> | Readonly<{
    kind: "leadEdited";
    stage: Stage;
    notes: string;
}> | Readonly<{
    kind: "saveLead";
}> | Readonly<{
    kind: "search";
    value: string;
}> | Readonly<{
    kind: "nextPage";
    before: string;
}> | Readonly<{
    kind: "slot";
    startsAt: string;
    endsAt: string;
    meetingUrl: string;
}> | Readonly<{
    kind: "removeSlot";
    id: string;
}> | Readonly<{
    kind: "systemView";
    view: "coaching" | "client";
}> | Readonly<{
    kind: "loaded";
    id: number;
    result: ClientResult<ManagementSnapshot>;
}> | Readonly<{
    kind: "written";
    id: number;
    result: ClientResult<Readonly<{
        acknowledged: true;
    }>>;
}> | Readonly<{
    kind: "journeyLoaded";
    id: number;
    result: ClientResult<readonly JourneyEvent[]>;
}> | Readonly<{
    kind: "workspaceMounted";
    id: number;
}>;
export function initialManagement(area: Area): ManagementModel { return { area, salesMode: "pipeline", editor: "overview", snapshot: null, draft: null, dirty: false, selected: "", leadStage: "free_value", leadNotes: "", leadDirty: false, events: [], search: "", before: "", systemView: "coaching", pending: undefined, serial: 0, error: "", notice: "" }; }
function effect(m: ManagementModel, e: Omit<Extract<ManagementEffect, {
    kind: "confirmCancel";
}>, "id"> | Omit<Extract<ManagementEffect, {
    kind: "confirmDiscard";
}>, "id"> | Omit<Extract<ManagementEffect, {
    kind: "load";
}>, "id"> | Omit<Extract<ManagementEffect, {
    kind: "write";
}>, "id"> | Omit<Extract<ManagementEffect, {
    kind: "journey";
}>, "id"> | Omit<Extract<ManagementEffect, {
    kind: "workspace";
}>, "id">): ManagementModel { return { ...m, serial: m.serial + 1, pending: { ...e, id: m.serial + 1 }, error: "" }; }
export function acceptManagement(m: ManagementModel, p: ManagementProposal): ManagementModel {
    if (p.kind === "workspaceBlocked")
        return { ...m, error: p.message };
    if (p.kind === "cancelBooking") {
        const lead = m.snapshot?.leads.find(l => l.id === m.selected);
        return m.pending || m.leadDirty || !lead ? m : effect(m, { kind: "confirmCancel", leadId: lead.id, revision: lead.revision });
    }
    if (p.kind === "discard")
        return m.pending ? m : effect(m, { kind: "confirmDiscard" });
    if (p.kind === "editor")
        return { ...m, editor: p.editor };
    if (p.kind === "settingsEdited")
        return m.pending ? m : { ...m, draft: p.settings, dirty: true, notice: "" };
    if (p.kind === "leadEdited")
        return m.pending ? m : { ...m, leadStage: p.stage, leadNotes: p.notes, leadDirty: true, notice: "" };
    if (["started", "saveSettings", "selectLead", "saveLead", "search", "nextPage", "slot", "removeSlot", "systemView"].includes(p.kind)) {
        if (m.pending)
            return m;
        if (p.kind === "started")
            return m.dirty || m.leadDirty ? { ...m, error: "Save your changes before refreshing." } : effect(m, { kind: "load", before: m.before, search: m.search });
        if (p.kind === "saveSettings")
            return m.draft && m.snapshot ? effect(m, { kind: "write", path: "settings", body: { settings: m.draft, revision: m.snapshot.revision } }) : m;
        if (p.kind === "saveLead") {
            const lead = m.snapshot?.leads.find(l => l.id === m.selected);
            return lead ? effect(m, { kind: "write", path: "lead", body: { leadId: lead.id, stage: m.leadStage, notes: m.leadNotes, revision: lead.revision } }) : m;
        }
        if (m.dirty || m.leadDirty)
            return { ...m, error: "Save your changes before continuing." };
        if (p.kind === "selectLead") {
            const lead = m.snapshot?.leads.find(l => l.id === p.id);
            return lead ? effect({ ...m, selected: p.id, leadStage: lead.stage, leadNotes: lead.notes, events: [] }, { kind: "journey", leadId: p.id }) : m;
        }
        if (p.kind === "search")
            return effect({ ...m, search: p.value, before: "", selected: "" }, { kind: "load", search: p.value, before: "" });
        if (p.kind === "nextPage")
            return effect({ ...m, before: p.before, selected: "" }, { kind: "load", search: m.search, before: p.before });
        if (p.kind === "slot")
            return effect(m, { kind: "write", path: "slots", body: { startsAt: p.startsAt, endsAt: p.endsAt, meetingUrl: p.meetingUrl } });
        if (p.kind === "removeSlot")
            return effect(m, { kind: "write", path: "slots/remove", body: { slotId: p.id } });
        if (p.kind === "systemView")
            return effect({ ...m, systemView: p.view }, { kind: "workspace", view: p.view });
    }
    if (!("id" in p) || !m.pending || m.pending.id !== p.id)
        return m;
    const replies: Readonly<Record<ManagementEffect["kind"], ManagementProposal["kind"]>> = { load: "loaded", write: "written", journey: "journeyLoaded", workspace: "workspaceMounted", confirmCancel: "cancelConfirmed", confirmDiscard: "discardConfirmed" };
    if (replies[m.pending.kind] !== p.kind)
        return m;
    if (p.kind === "cancelConfirmed")
        return m.pending.kind !== "confirmCancel" ? m : p.accepted ? effect(m, { kind: "write", path: "booking/cancel", body: { leadId: m.pending.leadId, revision: m.pending.revision } }) : { ...m, pending: undefined };
    if (p.kind === "discardConfirmed")
        return p.accepted ? effect({ ...m, dirty: false, leadDirty: false, notice: "" }, { kind: "load", before: m.before, search: m.search }) : { ...m, pending: undefined };
    if (p.kind === "workspaceMounted")
        return { ...m, pending: undefined };
    if (p.kind === "loaded") {
        if (!p.result.ok)
            return { ...m, pending: undefined, error: p.result.error.message };
        const selected = p.result.value.leads.find(l => l.id === m.selected);
        const next = { ...m, snapshot: p.result.value, draft: p.result.value.settings, dirty: false, leadDirty: false, selected: selected?.id ?? "", leadStage: selected?.stage ?? "free_value" as const, leadNotes: selected?.notes ?? "", events: selected ? m.events : [], pending: undefined, error: "" };
        return m.area === "marketing" ? effect(next, { kind: "workspace", view: "marketing" }) : m.area === "system" ? effect(next, { kind: "workspace", view: m.systemView }) : selected ? effect(next, { kind: "journey", leadId: selected.id }) : next;
    }
    if (p.kind === "journeyLoaded")
        return p.result.ok ? { ...m, pending: undefined, events: p.result.value } : { ...m, pending: undefined, error: p.result.error.message };
    if (p.kind === "written")
        return p.result.ok ? effect({ ...m, dirty: false, leadDirty: false, notice: "Saved." }, { kind: "load", before: m.before, search: m.search }) : { ...m, pending: undefined, error: p.result.error.message };
    return m;
}
export function managementNavigation(m: ManagementModel): NavigationGuard { return m.pending?.kind === "write" ? { kind: "blocked", message: "Finishing your save…" } : m.dirty || m.leadDirty ? { kind: "confirm", message: "Leave this page? Your unsaved changes will be lost." } : { kind: "ready" }; }
