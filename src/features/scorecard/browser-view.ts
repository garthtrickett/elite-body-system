import { html, nothing, svg } from "lit-html";
import { workspace } from "../../shared/browser-layout.ts";
import { live } from "lit-html/directives/live.js";
import type { Metric } from "./operations.ts";
import type { ScorecardState } from "./browser-model.ts";
import type { ScorecardActions } from "./browser-actions.ts";
import { icon } from "./icons.ts";
import { scorecardPanel } from "./browser-panels.ts";

const weightText = (value: number | undefined) => value === undefined ? "—" : value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
const labels = { weight: "Body weight in kg", energy: "Calories eaten today", protein: "Protein in grams", water: "Water in litres", sleep: "Hours slept", steps: "Steps today" } as const;

function metricInput(metric: Metric, state: ScorecardState, actions: ScorecardActions) {
  return html`<input id=${`sc-${metric}`} class="sc-number ${state.drafts[metric].length > 5 ? "sc-number-compact" : ""} ${metric === "weight" ? `sc-weight-input sc-weight-width-${Math.min(8, Math.max(2, state.drafts.weight.length || 3))}` : metric === "protein" || metric === "water" ? "sc-with-unit" : ""}"
    aria-label=${labels[metric]} aria-invalid=${state.errors[metric] ? "true" : "false"}
    aria-describedby=${state.errors[metric] ? `sc-error-${metric}` : nothing}
    type="text" inputmode=${metric === "steps" || metric === "energy" || metric === "protein" ? "numeric" : "decimal"}
    enterkeyhint="done" autocomplete="off" maxlength="12" placeholder="Add" .value=${live(state.drafts[metric])}
    @input=${(event: Event) => actions.changeMetric({ metric, value: (event.target as HTMLInputElement).value })}
    @blur=${() => actions.commitMetric({ metric })}
    @keydown=${(event: KeyboardEvent) => {
      if (event.key === "Enter") { event.preventDefault(); actions.commitMetric({ metric }); }
      if (event.key === "Escape") { event.preventDefault(); actions.cancelMetric({ metric }); }
    }}>`;
}

function metricError(metric: Metric, state: ScorecardState) {
  return state.errors[metric] ? html`<p id=${`sc-error-${metric}`} class="sc-error" role="alert">${state.errors[metric]}</p>` : nothing;
}

function metricTile(metric: Exclude<Metric, "weight">, title: string, unit: string, state: ScorecardState, actions: ScorecardActions) {
  const done = state.complete[metric];
  const target = metric === "energy" ? `of ${state.targets.energy} kcal` : metric === "protein" ? `of ${state.targets.protein}g`
    : metric === "water" ? `of ${state.targets.water.toFixed(1)}L` : metric === "sleep" ? `of ${state.targets.sleep}h` : `of ${state.targets.steps.toLocaleString("en-GB")}`;
  return html`<div class="sc-tile ${done ? "sc-tile-done" : ""}" data-testid=${`tile-${metric}`}>
    <label for=${`sc-${metric}`} class="sc-label">${title}${metric === "energy" || metric === "sleep" ? ` (${unit})` : ""}</label>
    <div class="flex min-w-0 items-baseline gap-1">${metricInput(metric, state, actions)}${unit && metric !== "energy" && metric !== "sleep" ? html`<span class="sc-unit">${unit}</span>` : nothing}</div>
    <p class="sc-target">${target}</p>${done ? html`<p class="sc-goal-met">✓ Goal met</p>` : state.day.values[metric] === undefined ? html`<p class="sc-entry-hint">Tap to enter</p>` : nothing}${metricError(metric, state)}${state.syncError && state.generation > state.savedGeneration ? html`<p class="sc-field-error">Day changes not saved</p>` : nothing}</div>`;
}

function carousel(state: ScorecardState, actions: ScorecardActions) {
  const names = ["Body weight", "Weight trend", "Consistency"] as const;
  return html`<section class="px-5" aria-label="Your progress">
    <div class="sc-progress-grid touch-pan-y"
      @touchstart=${(event: TouchEvent) => { const x = event.touches[0]?.clientX; if (x !== undefined) actions.startTouch({ x }); }}
      @touchend=${(event: TouchEvent) => { const x = event.changedTouches[0]?.clientX; if (x !== undefined) actions.endTouch({ x }); }}>
      <section class="sc-progress-card ${state.card === 0 ? "sc-progress-current" : ""}" aria-label="Body weight"><label class="sc-label text-xs" for="sc-weight">Body Weight</label>
        <div class="sc-weight-row"><div class="flex min-w-0 items-baseline gap-1">${metricInput("weight", state, actions)}<span class="sc-unit">kg</span></div>
          ${state.day.values.weight !== undefined && state.startWeight > 0 ? html`<span class="flex shrink-0 items-center gap-1 text-[17px] font-medium text-sc-ink"><span aria-hidden="true">${Number(state.weightDelta) === 0 ? "" : state.weightDown ? "↓" : "↑"}</span>${Number(state.weightDelta) === 0 ? "No change" : `${state.weightDelta} kg`}</span>` : nothing}</div>
        <p class="mt-2 text-xs text-sc-muted">${state.startWeight ? `Started at ${state.startWeight} kg` : "Add your starting weight in setup"}</p>${metricError("weight", state)}</section>
      <section class="sc-progress-card ${state.card === 1 ? "sc-progress-current" : ""}" aria-label="Weight trend"><h2 class="sc-label text-xs">Weight Trend</h2>
        ${state.hasWeightTrend ? html`<svg class="my-2 h-20 w-full overflow-visible" viewBox="0 0 310 80" preserveAspectRatio="none" role="img" aria-label=${`Weight trend from ${weightText(state.trendStartWeight)} to ${weightText(state.trendEndWeight)} kilograms`}>
          ${svg`<polygon points=${`${state.trendPoints} 310,80 0,80`} class="sc-trend-area"></polygon>
          <polyline points=${state.trendPoints} fill="none" class="sc-trend-line" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>`}
        </svg><div class="flex justify-between text-xs font-medium"><span class="text-sc-muted">Day ${state.trendStartDay} · ${weightText(state.trendStartWeight)} kg</span><span class="text-sc-ink">Day ${state.trendEndDay} · ${weightText(state.trendEndWeight)} kg</span></div>` : html`<div class="sc-empty-trend sc-copy">${state.hasWeightData ? html`<p><strong class="block text-sc-ink">${weightText(state.trendStartWeight)} kg · Day ${state.trendStartDay}</strong>Log another weigh-in to see your trend.</p>` : html`<p>Your weigh-ins will appear here.<br>Add a starting weight in setup, or log today’s weight.</p>`}</div>`}</section>
      <section class="sc-progress-card ${state.card === 2 ? "sc-progress-current" : ""}" aria-label="Consistency"><div class="mb-2 flex items-baseline justify-between"><h2 class="sc-label text-xs">Consistency</h2><span class="sc-data text-3xl text-sc-ink">${state.consistency}%</span></div>
        <table class="sc-consistency" aria-label="Tracking over the last seven days"><colgroup><col class="w-[78px]">${state.trackingHistory.map(() => html`<col>`)}</colgroup><thead><tr><td></td>${state.trackingHistory.map(day => html`<th scope="col" aria-current=${day.date === state.date ? "date" : nothing}><abbr title=${day.day}>${day.day.slice(0, 1)}</abbr><time class="sc-consistency-date" datetime=${day.date}>${Number(day.date.slice(-2))}</time></th>`)}</tr></thead>
          <tbody>${(["nutrition", "activity", "mindset"] as const).map(pillar => html`<tr><th scope="row">${pillar}</th>
            ${state.trackingHistory.map(day => html`<td><span class=${day[pillar] === 3 ? "sc-cell-full" : day[pillar] === 0 ? "sc-cell-empty" : "sc-cell-partial"} aria-label=${`${day[pillar]} of 3 tracked`}></span></td>`)}</tr>`)}</tbody></table>
        <div class="sc-consistency-legend"><span><i class="sc-cell-empty"></i>None</span><span><i class="sc-cell-partial"></i>1–2</span><span><i class="sc-cell-full"></i>All 3</span></div>
        <p class="mt-2 text-xs text-sc-muted">${state.trackedEntries} of ${state.consistencyTotal} daily entries · last 7 days</p></section>
    </div>
    <div class="sc-progress-controls flex items-center justify-center gap-1" aria-label="Progress cards">${names.map((name, card) => html`
      <button class="sc-dot-button" aria-label=${`Show ${name.toLowerCase()}`} aria-pressed=${card === state.card} @click=${() => actions.selectCard({ card })}>
        <span class=${card === state.card ? "sc-dot-active" : "sc-dot"}></span></button>`)}</div>
    <p class="sc-card-caption" aria-live="polite">${names[state.card]} · ${state.card + 1} of ${names.length}</p>
  </section>`;
}

function sectionHeader(name: "Nutrition" | "Activity" | "Mindset", state: ScorecardState, actions: ScorecardActions) {
  const panel = name.toLowerCase() as "nutrition" | "activity" | "mindset";
  return html`<div class="sc-section-heading"><span class="size-[15px] text-accent">${icon(panel)}</span>
    <a class="sc-section-button" href=${`/courses/${panel}`} aria-disabled=${state.saving} @click=${(event: Event) => { if (state.saving) event.preventDefault(); }}>${name}<span class="ml-1 text-sm text-sc-muted" aria-hidden="true">›</span></a>
    ${panel === "nutrition" ? html`<a class="sc-log-button" href="/meals" aria-disabled=${state.saving} @click=${(event: Event) => { if (state.saving) event.preventDefault(); }}><span class="size-3">${icon("plus")}</span>Log meal</a>` : nothing}</div>`;
}

function syncFeedback(state: ScorecardState, actions: ScorecardActions) {
  return html`<p class="sc-error" role="alert">${state.syncError}</p><div class="flex flex-wrap gap-2"><button class="sc-secondary" ?disabled=${state.saving} @click=${actions.retrySync}>Retry save</button><button class="sc-secondary" ?disabled=${state.saving} @click=${actions.reloadClient}>Reload saved version</button></div>`;
}
export function scorecardView(state: ScorecardState, actions: ScorecardActions) {
  if (!state.loaded) return workspace({ content: html`<div class="sc-page"><p class="sc-eyebrow">Elite Body System</p>
    ${state.syncError ? html`<p class="sc-error mt-6" role="alert">${state.syncError}</p><button class="sc-primary mt-4" @click=${actions.retrySync}>Try again</button><a class="sc-copy mt-4 underline" href="/sign-in">Sign in again</a>`
      : html`<p class="sc-copy mt-6" role="status">Loading your scorecard…</p>`}</div>` });
  return workspace({ mobileFooter: state.syncError && !state.panel ? html`<div class="sc-sync-footer">${syncFeedback(state, actions)}</div>` : undefined, content: html`
    <header class="sc-scorecard-header px-5 pt-6"><div class="flex flex-wrap items-center justify-between gap-2"><p class="sc-brand">Elite Body System</p>
      <span class="sc-streak" aria-label=${`${state.streak} day streak`}>${state.streak} day streak</span></div>
      <div class="mt-5 flex flex-wrap items-end justify-between gap-x-3 gap-y-2"><h1 class="sc-display text-[48px]">Day ${state.programDay}</h1><span class="sc-save-status" data-testid="save-status" aria-live="polite">${state.saving ? "Saving…" : state.generation > state.savedGeneration || state.syncError ? "Changes not saved" : "Saved to your account"}</span></div>
    </header>
    ${state.syncError && !state.panel ? html`<div class="sc-sync-desktop">${syncFeedback(state, actions)}</div>` : nothing}
    <div class="sc-content">
      ${carousel(state, actions)}
      ${state.storyInvitation && state.profile.profile.completed ? html`<section class="px-5" aria-label="Progress story invitation"><p class="sc-copy">A milestone worth celebrating: Harry has a progress story for you to review.</p><a class="sc-secondary ob-link mt-2" href="/account/media">Review my story · optional</a></section>` : nothing}
      <div class="sc-pillar-grid"><section class="px-5" aria-label="Nutrition">${sectionHeader("Nutrition", state, actions)}<div class="sc-tile-grid">
        ${metricTile("energy", "Energy", "kcal", state, actions)}${metricTile("protein", "Protein", "g", state, actions)}${metricTile("water", "Water", "L", state, actions)}
      </div></section>
      <section class="px-5" aria-label="Activity">${sectionHeader("Activity", state, actions)}<div class="sc-tile-grid">
        ${metricTile("sleep", "Sleep", "h", state, actions)}
        <div class="sc-tile ${state.complete.training ? "sc-tile-done" : "sc-training-tile"}" data-testid="tile-training"><p class="sc-label">Training</p>
          <span class="sc-training-mark" aria-hidden="true">${state.complete.training ? icon("check") : "—"}</span>
          <a class="sc-training-button text-center" href="/training" aria-disabled=${state.saving} @click=${(event: Event) => { if (state.saving) event.preventDefault(); }}>${state.complete.training ? "Complete" : "Start"}</a></div>
        ${metricTile("steps", "Steps", "", state, actions)}
      </div></section>
      <section class="px-5 pb-3" aria-label="Mindset">${sectionHeader("Mindset", state, actions)}<div class="sc-tile-grid sc-mindset-grid">
        <div class="sc-tile ${state.complete.map ? "sc-tile-done" : "sc-map-tile"}" data-testid="tile-map"><p class="sc-label">Map</p>
          <a class="sc-check-button" aria-label="Read your Neural Map" href="/mindset/map" aria-disabled=${state.saving} @click=${(event: Event) => { if (state.saving) event.preventDefault(); }}>${state.complete.map ? icon("check") : html`Read <span aria-hidden="true">›</span>`}</a>
          <p class="sc-target">${state.complete.map ? "✓ Complete" : "Not yet"}</p></div>
        <button class="sc-tile text-left ${state.complete.ltr ? "sc-tile-done" : ""}" aria-label="Open L to R" @click=${() => actions.openPanel({ panel: "ltr" })}>
          <span class="sc-label">L to R${state.complete.ltr ? " ✓" : ""}</span><span class="sc-tile-action">Open <span aria-hidden="true">›</span></span><span class="sc-ltr-summary">${state.day.brainDump || state.day.goals.length ? html`${state.day.brainDump.trim() ? "Thoughts captured" : "Empty your head"}<br>${state.day.goals.length} ${state.day.goals.length === 1 ? "goal" : "goals"}` : "Empty your head. Set today’s goals."}</span></button>
        <div class="sc-tile sc-focus-tile ${state.complete.focus ? "sc-tile-done" : state.priority ? "sc-map-tile" : ""}" data-testid="tile-focus"><p class="sc-label">Focus</p>
          <button class="sc-check-button sc-completion-button" aria-label="Mark Focus complete" aria-pressed=${state.day.checks.focus} @click=${() => actions.toggleCheck({ check: "focus" })}><span class="sc-checkbox" aria-hidden="true">${state.complete.focus ? icon("check") : nothing}</span></button>
          <p class="sc-target">${state.complete.focus ? "✓ Complete" : "Not yet"}</p><p class="sc-focus-priority break-words text-xs" title=${state.priority}>${state.priority ? `★ ${state.priority}` : "30 min priority"}</p></div>
      </div></section></div>
      ${state.allDone ? html`<p role="status" class="px-5 text-center text-xs font-medium text-sc-ink">One card. Three pillars. Day complete.</p>` : nothing}
    </div>
    ${state.rolloverNotice ? html`<p class="sc-copy px-4 py-2 text-xs" role="status">A new day has started. Finish your edit; the next scorecard loads after saving.</p>` : nothing}
    ${scorecardPanel(state, actions)}
  ` });
}
