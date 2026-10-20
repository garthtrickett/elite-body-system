import { html, nothing } from "lit-html";
import { live } from "lit-html/directives/live.js";
import type { Metric } from "./operations.ts";
import type { Panel, ScorecardState } from "./browser-model.ts";
import type { ScorecardActions } from "./browser-actions.ts";
import { icon } from "./icons.ts";
import type { IconName } from "./icons.ts";
import { scorecardPanel } from "./browser-panels.ts";

const labels = { weight: "Body weight in kg", energy: "Calories eaten today", protein: "Protein in grams", water: "Water in litres", sleep: "Hours slept", steps: "Steps today" } as const;
function placeholders(state: ScorecardState) {
  return { weight: "—", energy: String(state.targets.energy), protein: String(state.targets.protein), water: state.targets.water.toFixed(1),
    sleep: `${state.targets.sleep}h`, steps: state.targets.steps.toLocaleString("en-GB") };
}

function metricInput(metric: Metric, state: ScorecardState, actions: ScorecardActions) {
  return html`<input id=${`sc-${metric}`} class="sc-number ${metric === "weight" ? "sc-weight-input" : metric === "protein" || metric === "water" ? "sc-with-unit" : ""}"
    aria-label=${labels[metric]} aria-invalid=${state.errors[metric] ? "true" : "false"}
    aria-describedby=${state.errors[metric] ? `sc-error-${metric}` : nothing}
    type="text" inputmode=${metric === "steps" || metric === "energy" || metric === "protein" ? "numeric" : "decimal"}
    enterkeyhint="done" autocomplete="off" maxlength="12" placeholder=${placeholders(state)[metric]} .value=${live(state.drafts[metric])}
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
  const target = metric === "energy" ? `of ${state.targets.energy} cal` : metric === "protein" ? `of ${state.targets.protein}g`
    : metric === "water" ? `of ${state.targets.water.toFixed(1)}L` : metric === "sleep" ? `of ${state.targets.sleep}h` : `of ${placeholders(state).steps}`;
  return html`<div class="sc-tile ${done ? "sc-tile-done" : ""}" data-testid=${`tile-${metric}`}>
    <label for=${`sc-${metric}`} class="sc-label">${title}</label>
    <div class="flex min-w-0 items-baseline gap-1">${metricInput(metric, state, actions)}${unit ? html`<span class="sc-unit">${unit}</span>` : nothing}</div>
    <p class="sc-target">${done ? "GOAL MET" : target}</p>${metricError(metric, state)}</div>`;
}

function carousel(state: ScorecardState, actions: ScorecardActions) {
  const names = ["Body weight", "Weight trend", "Consistency"] as const;
  return html`<section class="px-5" aria-label="Your progress">
    <div class="sc-progress-card touch-pan-y" role="group" aria-roledescription="carousel" aria-label=${names[state.card] ?? names[0]}
      @touchstart=${(event: TouchEvent) => { const x = event.touches[0]?.clientX; if (x !== undefined) actions.startTouch({ x }); }}
      @touchend=${(event: TouchEvent) => { const x = event.changedTouches[0]?.clientX; if (x !== undefined) actions.endTouch({ x }); }}>
      ${state.card === 0 ? html`<label class="sc-label text-xs" for="sc-weight">Body Weight</label>
        <div class="mt-2 flex items-baseline gap-4"><div class="flex min-w-0 items-baseline gap-1">${metricInput("weight", state, actions)}<span class="sc-display text-2xl text-sc-muted">kg</span></div>
          <span class="flex shrink-0 items-center gap-1 text-[17px] font-extrabold text-accent"><span aria-hidden="true">${state.weightDown ? "↓" : "↑"}</span>${state.weightDelta} kg</span></div>
        <p class="mt-2 text-xs text-sc-muted">${state.startWeight ? `Started at ${state.startWeight} kg` : "Add your starting weight in setup"}</p>${metricError("weight", state)}`
      : state.card === 1 ? html`<h2 class="sc-label text-xs">Weight Trend</h2>
        <svg class="my-2 h-20 w-full overflow-visible" viewBox="0 0 310 80" preserveAspectRatio="none" role="img" aria-label=${`Weight trend from ${state.startWeight} to ${state.day.values.weight ?? state.startWeight} kilograms`}>
          <polygon points=${`${state.trendPoints} 310,80 0,80`} fill="#D8FF3D" opacity="0.14"></polygon>
          <polyline points=${state.trendPoints} fill="none" stroke="#D8FF3D" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
        </svg><div class="flex justify-between text-[11px] font-bold"><span class="text-sc-muted">Day 1 · ${state.startWeight} kg</span><span class="text-accent">Day ${state.programDay} · ${state.day.values.weight ?? "—"} kg</span></div>`
      : html`<div class="mb-2 flex items-baseline justify-between"><h2 class="sc-label text-xs">Consistency</h2><span class="sc-display text-3xl text-accent">${state.consistency}%</span></div>
        <table class="sc-consistency" aria-label="Tracking over the last seven days"><colgroup><col class="w-[65px]">${state.trackingHistory.map(() => html`<col>`)}</colgroup><thead><tr><td></td>${state.trackingHistory.map(day => html`<th scope="col">${day.day.slice(0, 1)}<span class="sr-only">${day.day.slice(1)}</span></th>`)}</tr></thead>
          <tbody>${(["nutrition", "activity", "mindset"] as const).map(pillar => html`<tr><th scope="row">${pillar}</th>
            ${state.trackingHistory.map(day => html`<td><span class=${day[pillar] === 3 ? "sc-cell-full" : day[pillar] === 0 ? "sc-cell-empty" : "sc-cell-partial"} aria-label=${`${day[pillar]} of 3 tracked`}></span></td>`)}</tr>`)}</tbody></table>
        <p class="mt-2 text-[10px] text-sc-muted">Tracked · last 7 days · consistency, not perfection</p>`}
    </div>
    <div class="flex h-5 items-center justify-center gap-0.5" aria-label="Progress cards">${names.map((name, card) => html`
      <button class="sc-dot-button" aria-label=${`Show ${name.toLowerCase()}`} aria-pressed=${card === state.card} @click=${() => actions.selectCard({ card })}>
        <span class=${card === state.card ? "sc-dot-active" : "sc-dot"}></span></button>`)}</div>
  </section>`;
}

function sectionHeader(name: "Nutrition" | "Activity" | "Mindset", state: ScorecardState, actions: ScorecardActions) {
  const panel = name.toLowerCase() as "nutrition" | "activity" | "mindset";
  return html`<div class="sc-section-heading"><span class="size-[15px] text-accent">${icon(panel)}</span>
    <a class="sc-section-button" href=${`/courses/${panel}`} aria-disabled=${state.saving} @click=${(event: Event) => { if (state.saving) event.preventDefault(); }}>${name}<span class="ml-1 text-sm text-sc-muted" aria-hidden="true">›</span></a>
    ${panel === "nutrition" ? html`<a class="sc-log-button" href="/meals" aria-disabled=${state.saving} @click=${(event: Event) => { if (state.saving) event.preventDefault(); }}><span class="size-3">${icon("plus")}</span>Log meal</a>` : nothing}</div>`;
}

function navigation(state: ScorecardState, actions: ScorecardActions) {
  const tabs: readonly Readonly<{ label: string; icon: IconName; panel: Panel | "training" | undefined }>[] = [
    { label: "Day 1 setup", icon: "flag", panel: "setup" }, { label: "Training", icon: "activity", panel: "training" },
    { label: "Scorecard", icon: "scorecard", panel: undefined }, { label: "Profile", icon: "profile", panel: "profile" },
  ];
  return html`<nav class="sc-nav" aria-label="Main navigation">${tabs.map(tab => html`
    ${tab.panel === "training" ? html`<a class="sc-nav-button" aria-label="Training" href="/training" aria-disabled=${state.saving} @click=${(event: Event) => { if (state.saving) event.preventDefault(); }}>${icon("activity")}</a>` : html`<button class="sc-nav-button ${state.panel === tab.panel ? "sc-nav-active" : ""}" aria-label=${tab.label}
      aria-current=${state.panel === tab.panel ? "page" : nothing}
      @click=${() => { if (tab.panel && tab.panel !== "training") actions.openPanel({ panel: tab.panel }); else actions.closePanel(); }}>${icon(tab.icon)}</button>`}`)}</nav>`;
}

export function scorecardView(state: ScorecardState, actions: ScorecardActions) {
  if (!state.loaded) return html`<div class="sc-app"><div class="sc-shell p-5"><p class="sc-eyebrow">Elite Body System</p>
    ${state.syncError ? html`<p class="sc-error mt-6" role="alert">${state.syncError}</p><button class="sc-primary mt-4" @click=${actions.retrySync}>Try again</button><a class="sc-copy mt-4 underline" href="/sign-in">Sign in again</a>`
      : html`<p class="sc-copy mt-6" role="status">Loading your scorecard…</p>`}</div></div>`;
  return html`<div class="sc-app"><div class="sc-shell">
    <header class="px-5 pt-3.5"><div class="flex items-center justify-between"><p class="text-xs font-bold uppercase tracking-[1.5px] text-accent">Elite Body System</p>
      <span class="sc-streak" aria-label=${`${state.streak} day streak`}><span class="size-3 text-accent">${icon("flame")}</span>${state.streak}</span></div>
      <div class="mt-1 flex items-end justify-between gap-2"><h1 class="sc-display text-4xl leading-[0.95]">DAY ${state.programDay}</h1><span class="pb-0.5 text-[9px] text-sc-muted" data-testid="save-status" aria-live="polite">${state.saving ? "Saving…" : state.generation > state.savedGeneration || state.syncError ? "Changes not saved" : "Saved to your account"}</span></div>
    </header>
    ${state.syncError ? html`<div class="px-5 pt-4"><p class="sc-error" role="alert">${state.syncError}</p><div class="mt-2 flex gap-2"><button class="sc-secondary" @click=${actions.retrySync}>Retry save</button><button class="sc-secondary" @click=${actions.reloadClient}>Reload saved version</button></div></div>` : nothing}
    <div class="sc-content">
      ${carousel(state, actions)}
      <section class="px-5" aria-label="Nutrition">${sectionHeader("Nutrition", state, actions)}<div class="sc-tile-grid">
        ${metricTile("energy", "Energy", "", state, actions)}${metricTile("protein", "Protein", "g", state, actions)}${metricTile("water", "Water", "L", state, actions)}
      </div></section>
      <section class="px-5" aria-label="Activity">${sectionHeader("Activity", state, actions)}<div class="sc-tile-grid">
        ${metricTile("sleep", "Sleep", "", state, actions)}
        <div class="sc-tile ${state.complete.training ? "sc-tile-done" : "sc-training-tile"}" data-testid="tile-training"><p class="sc-label">Training</p>
          <span class="sc-training-mark" aria-hidden="true">${state.complete.training ? icon("check") : "—"}</span>
          <a class="sc-training-button text-center" href="/training" aria-disabled=${state.saving} @click=${(event: Event) => { if (state.saving) event.preventDefault(); }}>${state.complete.training ? "Smashed" : "Start"}</a></div>
        ${metricTile("steps", "Steps", "", state, actions)}
      </div></section>
      <section class="px-5 pb-3" aria-label="Mindset">${sectionHeader("Mindset", state, actions)}<div class="sc-tile-grid">
        <div class="sc-tile ${state.complete.map ? "sc-tile-done" : "sc-map-tile"}" data-testid="tile-map"><p class="sc-label">Map</p>
          <a class="sc-check-button" aria-label="Read your Neural Map" href="/mindset/map" aria-disabled=${state.saving} @click=${(event: Event) => { if (state.saving) event.preventDefault(); }}>${icon("check")}</a>
          <p class="sc-target">${state.complete.map ? "COMPLETE" : "NOT YET"}</p></div>
        <button class="sc-tile text-left ${state.complete.ltr ? "sc-tile-done" : ""}" aria-label="Open L to R" @click=${() => actions.openPanel({ panel: "ltr" })}>
          <span class="sc-label">L to R</span><span class="sc-ltr-summary">${state.day.brainDump || state.day.goals.length ? html`${state.day.brainDump.trim() ? "Thoughts captured" : "Empty your head"}<br>${state.day.goals.length} ${state.day.goals.length === 1 ? "goal" : "goals"}` : "Empty your head. Set today’s goals."}</span></button>
        <div class="sc-tile ${state.complete.focus ? "sc-tile-done" : state.priority ? "sc-map-tile" : ""}" data-testid="tile-focus"><p class="sc-label">Focus</p>
          <button class="sc-check-button" aria-label="Mark Focus complete" aria-pressed=${state.day.checks.focus} @click=${() => actions.toggleCheck({ check: "focus" })}>${icon("check")}</button>
          <p class="sc-target">${state.complete.focus ? "COMPLETE" : "NOT YET"}</p><p class="truncate text-[10px]" title=${state.priority}>${state.priority ? `★ ${state.priority}` : "30min priority"}</p></div>
      </div></section>
      ${state.allDone ? html`<p role="status" class="px-5 text-center text-xs font-bold text-accent">One card. Three pillars. Day complete.</p>` : nothing}
    </div>
    ${navigation(state, actions)}
    ${state.rolloverNotice ? html`<p class="sc-copy px-4 py-2 text-xs" role="status">A new day has started. Finish your edit; the next scorecard loads after saving.</p>` : nothing}
    ${scorecardPanel(state, actions)}
  </div></div>`;
}
