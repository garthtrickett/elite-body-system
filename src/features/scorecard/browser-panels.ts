import { html, nothing } from "lit-html";
import type { ScorecardState } from "./browser-model.ts";
import type { ScorecardActions } from "./browser-actions.ts";
import { icon } from "./icons.ts";
import { onboardingView, profileView } from "../profile/browser.ts";

const titles = { setup: "Your setup", profile: "Your profile", ltr: "L to R" } as const;

function ltrPanel(state: ScorecardState, actions: ScorecardActions) {
  return html`<p class="sc-copy">Empty your head on the left. Pull today’s goals to the right. Star the one that gets your 30 minutes.</p>
    <div class="sc-ltr-layout"><div class="sc-ltr-column"><label class="sc-label" for="brain-dump">Left · Brain dump</label>
    <textarea id="brain-dump" class="sc-textarea" rows="5" maxlength="5000" placeholder="Everything on your mind. Tasks, worries, ideas. No order."
      .value=${state.day.brainDump} @input=${(event: Event) => actions.changeBrainDump({ value: (event.target as HTMLTextAreaElement).value })}></textarea></div>
    <div class="sc-ltr-column"><h3 class="sc-label">Right · Today’s goals</h3>
    <ul class="space-y-2">${state.day.goals.map(goal => html`<li class="sc-goal">
      <button class="sc-icon-button ${goal.priority ? "text-sc-ink" : "text-sc-muted"}" aria-label=${`Prioritize ${goal.text}`} aria-pressed=${goal.priority}
        @click=${() => actions.selectPriority({ id: goal.id })}>${icon("star")}</button>
      <span class="min-w-0 flex-1 break-words text-sm">${goal.text}</span>
      <button class="sc-icon-button text-sc-muted" aria-label=${`Remove ${goal.text}`} @click=${() => actions.removeGoal({ id: goal.id })}>×</button>
    </li>`)}</ul>
    <form class="flex gap-2" @submit=${(event: Event) => { event.preventDefault(); actions.addGoal(); }}>
      <label class="sr-only" for="new-goal">Add a goal</label>
      <input id="new-goal" class="sc-textarea min-w-0 flex-1" maxlength="200" placeholder="Add a goal" .value=${state.goalDraft}
        @input=${(event: Event) => actions.changeGoalDraft({ value: (event.target as HTMLInputElement).value })}>
      <button class="sc-secondary" type="submit">+ Add</button>
    </form>
    <p class="sc-copy text-xs">Starred goal goes to your Focus box.</p></div></div>
    <button class="sc-primary mt-auto" @click=${actions.closePanel}>Done</button>`;
}

function panelContent(state: ScorecardState, actions: ScorecardActions) {
  switch (state.panel) {
    case "ltr": return ltrPanel(state, actions);
    case "profile": return html`<p class="sc-copy break-words">${state.account.email}</p>
      ${profileView(state.profileUi, { propose: actions.proposeProfile, close: actions.closePanel }, state.pending?.kind === "saveProfile")}
      <button class="sc-primary" ?disabled=${state.account.busy} @click=${actions.signOut}>${state.account.busy ? "Signing out…" : "Sign out"}</button>
      ${state.account.problem ? html`<p role="alert" class="sc-error">${state.account.problem}</p>` : nothing}`;
    case "setup": return onboardingView(state.profileUi, { propose: actions.proposeProfile, close: actions.closePanel }, state.pending?.kind === "saveProfile");
    default: return nothing;
  }
}

export function scorecardPanel(state: ScorecardState, actions: ScorecardActions) {
  return html`<dialog class="sc-dialog ${state.panel === "setup" ? "sc-dialog-setup" : ""}" aria-labelledby="sc-panel-title" @cancel=${(event: Event) => { event.preventDefault(); actions.closePanel(); }}>
    <div class="sc-panel-body">
      <header class="sc-panel-header"><button class="sc-icon-button -ml-2" aria-label="Back to scorecard" @click=${actions.closePanel}>${icon("back")}</button>
      <h2 id="sc-panel-title" class="sc-display text-[40px] leading-[1.1]">${state.panel ? titles[state.panel] : ""}</h2></header>
      ${panelContent(state, actions)}
      ${state.panel === "setup" || state.message || state.syncError ? html`<div class="sc-panel-feedback space-y-3">${state.message ? html`<p class="sc-copy" role="status">${state.message}</p>` : nothing}
      ${state.syncError ? html`<p class="sc-error" role="alert">${state.syncError}</p><button class="sc-secondary" @click=${actions.retrySync}>Retry save</button><button class="sc-secondary" @click=${actions.reloadClient}>Reload saved version</button>` : nothing}</div>` : nothing}
    </div>
  </dialog>`;
}
