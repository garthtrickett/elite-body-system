import { settingsEditor } from "./page-editor-view.ts";
import { salesBoard } from "./pipeline-view.ts";
import { callScript } from "./call-script-view.ts";
import { html, nothing } from "lit-html";
import type { ManagementModel, ManagementProposal } from "./management-model.ts";
export type ManagementViewInput = Readonly<{
    state: ManagementModel;
    propose: (p: ManagementProposal) => void;
    signOut: () => void;
    accountEmail: string;
    outlet: HTMLElement;
}>;
export function managementView(input: ManagementViewInput) {
    const { state, propose } = input;
    return html `<div class="mp-shell"><header class="mp-header"><a class="mp-brand" href="/manage"><img src="/assets/sales/logo.png" alt="Elite Body System"><span>Management</span></a><nav aria-label="Management areas">${([['marketing', 'Elite Marketing System'], ['sales', 'Elite Sales System'], ['system', 'Elite Delivery']] as const).map(([area, label]) => html `<a href=${`/manage/${area}`} aria-current=${state.area === area ? "page" : nothing}>${label}</a>`)}</nav><button class="mp-link" @click=${input.signOut}>Sign out</button></header><main class="mp-main" id="workspace-content"><div class="mp-page-heading"><div><p class="mp-eyebrow">Your business, in one place</p><h1>${state.area === "marketing" ? "Elite Marketing System" : state.area === "sales" ? "Elite Sales System" : "Elite Delivery"}</h1></div><button class="mp-button mp-secondary" ?disabled=${!!state.pending || state.dirty || state.leadDirty} @click=${() => propose({ kind: "started" })}>${state.pending ? "Working…" : "Refresh"}</button></div><p class="mp-error" role="alert" ?hidden=${!state.error}>${state.error}</p><p class="mp-notice" role="status" ?hidden=${!state.notice}>${state.notice}</p>
    ${!state.snapshot ? html `<section class="mp-panel"><p role="status">${state.error ? "This area could not be opened. Check your access and try again." : "Opening your workspace…"}</p></section>` : state.area === "marketing" ? html `<section class="mp-system-outlet">${input.outlet}</section>` : state.area === "sales" ? html `<nav class="mp-subnav" aria-label="Sales system navigation"><a href="/manage/sales" aria-current=${state.salesMode === "pipeline" ? "page" : nothing}>Pipeline</a><a href="/manage/sales?tab=pages" aria-current=${state.salesMode === "pages" ? "page" : nothing}>Funnel pages</a><a href="/manage/sales?tab=script" aria-current=${state.salesMode === "script" ? "page" : nothing}>Call script</a></nav>${state.salesMode === "pages" ? settingsEditor(input) : state.salesMode === "script" ? callScript(input) : salesBoard(input)}` : html `<nav class="mp-subnav" aria-label="Elite Body System views"><a href="/manage/system?view=coaching" aria-current=${state.systemView === "coaching" ? "page" : nothing}>EBS Mentor Portal</a><a href="/manage/system?view=client" aria-current=${state.systemView === "client" ? "page" : nothing}>EBS Member Portal</a></nav><div class="mp-section-head"><div><h2>${state.systemView === "coaching" ? "EBS Mentor Portal" : "EBS Member Portal"}</h2><p class="mp-muted">${state.systemView === "coaching" ? "Manage clients, messages, progress, programming and check-ins." : "Your signed-in account’s client experience. Client records remain private."}</p></div><a href=${state.systemView === "coaching" ? "/mentor" : "/"} target="_blank" rel="noopener">Open full workspace ↗</a></div><section class="mp-system-outlet">${input.outlet}</section>`}
    </main><footer class="mp-footer"><span>Elite Body System™</span><span>${input.accountEmail}</span></footer></div>`;
}
