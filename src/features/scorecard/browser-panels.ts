import { html, nothing } from "lit-html";
import type { ScorecardState } from "./browser-model.ts";
import type { ScorecardActions } from "./browser-actions.ts";
import { icon } from "./icons.ts";
import { SAMPLE } from "./sample.ts";

const titles = { setup: "This is Day 1.", training: "Isolated Day", profile: "Your profile", meal: "Log a Meal",
  nutrition: "Elite Body Nutrition", activity: "The 4-Day Split", mindset: "Neural Map", map: "Your Neural Map", ltr: "L to R" } as const;
const lessons = {
  nutrition: ["Energy Balance & the Block System", "The Protein Rule", "Digestibility & Fuelling", "Adherence"],
  activity: ["The 4-Day Split", "The Ownership Rule", "Active Recovery", "Rest Periods"],
  mindset: ["The Neural Map", "Identity", "Polarising Futures", "Reading the Signals"],
} as const;

function ltrPanel(state: ScorecardState, actions: ScorecardActions) {
  return html`<p class="sc-copy">Empty your head on the left. Pull today’s goals to the right. Star the one that gets your 30 minutes.</p>
    <label class="sc-label" for="brain-dump">Left · Brain dump</label>
    <textarea id="brain-dump" class="sc-textarea" rows="5" maxlength="5000" placeholder="Everything on your mind. Tasks, worries, ideas. No order."
      .value=${state.day.brainDump} @input=${(event: Event) => actions.changeBrainDump({ value: (event.target as HTMLTextAreaElement).value })}></textarea>
    <h3 class="sc-label">Right · Today’s goals</h3>
    <ul class="space-y-2">${state.day.goals.map(goal => html`<li class="sc-goal">
      <button class="sc-icon-button ${goal.priority ? "text-accent" : "text-sc-muted"}" aria-label=${`Prioritize ${goal.text}`} aria-pressed=${goal.priority}
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
    <p class="sc-copy text-xs">Starred goal goes to your Focus box.</p>
    <button class="sc-primary mt-auto" @click=${actions.closePanel}>Done</button>`;
}

function panelContent(state: ScorecardState, actions: ScorecardActions) {
  switch (state.panel) {
    case "ltr": return ltrPanel(state, actions);
    case "profile": return html`<p class="sc-copy break-words">${state.account.email}</p>
      <div class="sc-panel-card"><p class="sc-label">Scorecard preview</p><p class="sc-copy mt-2">You’re exploring Harry’s sample Day 12. Entries stay in this tab until you refresh. Your account is real; the coaching data is a sample.</p></div>
      <button class="sc-secondary" @click=${actions.resetSample}>Reset sample day</button>
      <button class="sc-primary" ?disabled=${state.account.busy} @click=${actions.signOut}>${state.account.busy ? "Signing out…" : "Sign out"}</button>
      ${state.account.problem ? html`<p role="alert" class="sc-error">${state.account.problem}</p>` : nothing}`;
    case "training": return html`<p class="sc-eyebrow">My Program · Week 2 of 12</p>
      <p class="sc-copy">Owns today: body composition. Everything else is capped.</p>
      <ul class="space-y-2">${SAMPLE.exercises.map(exercise => html`<li class="sc-panel-card"><h3 class="font-semibold">${exercise.name}</h3><p class="sc-copy mt-1 text-xs">${exercise.detail}</p></li>`)}</ul>
      <p class="sc-copy text-xs">Sample session. Set logging, rest timers, and exercise history come in the training iteration.</p>
      <button class="sc-primary" aria-pressed=${state.day.checks.training} @click=${() => actions.toggleCheck({ check: "training" })}>
        ${state.day.checks.training ? "Undo workout completion" : "Mark sample workout complete"}</button>`;
    case "map": return html`<p class="sc-copy">A sample Map. Read it slowly. Let yourself feel it, don’t just read it.</p>
      ${SAMPLE.map.map((part, i) => html`<section class="sc-panel-card"><p class="sc-label">0${i + 1} · ${part.title}</p><p class="sc-copy mt-2">${part.text}</p></section>`)}
      <button class="sc-primary" aria-pressed=${state.day.checks.map} @click=${() => actions.toggleCheck({ check: "map" })}>
        ${state.day.checks.map ? "Undo today’s read" : "Mark Map read for today"}</button>`;
    case "meal": return html`<p class="sc-copy">Speak it, snap it, or both.</p>
      <div class="sc-panel-card"><p class="sc-label">Meal logging preview</p><p class="sc-copy mt-2">Photo and voice analysis will arrive in the meal logging iteration. For this preview, enter your daily calories and protein directly on the scorecard.</p></div>
      <button class="sc-primary" @click=${actions.closePanel}>Back to scorecard</button>`;
    case "setup": return html`<p class="sc-copy">Not another fresh start. A system built so you never have to start again.</p>
      <div class="sc-panel-card"><p class="sc-label">Your first day</p><p class="sc-copy mt-2">Build your week. Tell Harry your story. Set your starting point and the person you’re becoming.</p></div>
      <p class="sc-copy">Harry’s full setup flow will be connected in the onboarding iteration. You can explore the sample scorecard now.</p>
      <button class="sc-primary" @click=${actions.closePanel}>Explore my scorecard</button>`;
    case "nutrition": case "activity": case "mindset": return html`<p class="sc-eyebrow">Phase 1 · Course preview</p>
      <p class="sc-copy">One episode every three weeks, alongside the other two pillars.</p>
      <ol class="space-y-2">${lessons[state.panel].map((lesson, i) => html`<li class="sc-panel-card"><span class="sc-label">Episode ${i + 1}</span><h3 class="mt-2 font-semibold">${lesson}</h3></li>`)}</ol>
      <p class="sc-copy text-xs">Lesson videos, tasks, and progress tracking come in the courses iteration.</p>`;
    default: return nothing;
  }
}

export function scorecardPanel(state: ScorecardState, actions: ScorecardActions) {
  return html`<dialog class="sc-dialog" aria-labelledby="sc-panel-title" @cancel=${(event: Event) => { event.preventDefault(); actions.closePanel(); }}>
    <div class="sc-panel-body">
      <button class="sc-icon-button -ml-2" aria-label="Back to scorecard" @click=${actions.closePanel}>${icon("back")}</button>
      <h2 id="sc-panel-title" class="sc-display text-[40px] leading-none">${state.panel ? titles[state.panel] : ""}</h2>
      ${panelContent(state, actions)}
      ${state.message ? html`<p class="sc-copy" role="status">${state.message}</p>` : nothing}
    </div>
  </dialog>`;
}
