import { html, nothing } from "lit-html";
import { live } from "lit-html/directives/live.js";
import { EPISODES } from "./courses.ts";
import type { Pillar } from "./courses.ts";
import { MAP_PARTS, MAP_STEPS } from "./map-content.ts";
import { episodeStatus } from "./data.ts";
import type { LearningState, LearningProposal } from "./browser-model.ts";
type Propose = (proposal: LearningProposal) => void;

function mapBuilder(state: LearningState, propose: Propose) {
  const map = state.map, step = map ? MAP_STEPS[map.step] : undefined;
  if (!map || !step) return nothing;
  return html`<p class="sc-eyebrow">Neural Map · ${map.step + 1} of ${MAP_STEPS.length}</p><h2 class="sc-display text-[38px] leading-none">${step.part ? `${step.part} ` : ""}${step.title}</h2><p class="sc-copy">${step.lead}</p>
    ${step.history?.map(item => html`<section class="sc-panel-card"><h3 class="sc-label">${item.was}</h3><p class="sc-copy mt-2">${item.now}</p><p class="sc-copy mt-2 text-[10px]">${item.src}</p></section>`)}
    ${step.networks?.map(network => html`<section class="sc-panel-card space-y-3"><h3 class="sc-label">${network.name}</h3><p class="sc-copy">${network.job}</p><p class="sc-copy">${network.alone}</p><p class="sc-copy">${network.withMap}</p><p class="sc-copy text-[10px]">${network.src}</p></section>`)}
    ${step.apart ? html`<p class="sc-copy">${step.apart}</p>` : nothing}${step.together ? html`<p class="sc-copy">${step.together}</p>` : nothing}
    ${step.feeling ? html`<section class="sc-panel-card"><h3 class="sc-label">${step.feeling.title}</h3>${step.feeling.text.map(text => html`<p class="sc-copy mt-3">${text}</p>`)}<p class="sc-copy mt-3 font-semibold">${step.feeling.line}</p><p class="sc-copy mt-2 text-[10px]">${step.feeling.src}</p></section>` : nothing}
    ${step.why?.map(text => html`<p class="sc-copy">${text}</p>`)}${step.how ? html`<ul class="list-disc space-y-2 pl-5">${step.how.map(text => html`<li class="sc-copy">${text}</li>`)}</ul>` : nothing}
    ${step.keys?.map(key => { const part = MAP_PARTS.find(item => item.key === key); return html`<label class="sc-form-field"><span class="sc-label">${part?.title}</span><span class="sc-copy text-xs">${part?.hint}</span><textarea class="sc-textarea" rows=${key === "final" ? 2 : 4} maxlength="5000" .value=${live(map[key])}
      @input=${(event: Event) => propose({ kind: "mapChanged", key, value: (event.target as HTMLTextAreaElement).value })}></textarea></label>`; })}
    ${step.src ? html`<p class="sc-copy text-[10px]">${step.src}</p>` : nothing}
    <button class="sc-primary" @click=${() => propose({ kind: map.step === 6 ? "mapFinished" : "mapNext" })}>${map.step === 6 ? "Save my Map" : "Save and continue"}</button>
    <button class="sc-secondary" ?disabled=${map.step === 0} @click=${() => propose({ kind: "mapBack" })}>Back</button>`;
}

function mapReading(state: LearningState, propose: Propose) {
  return html`<h1 class="sc-display text-[40px]">Your Neural Map</h1><p class="sc-copy">Read it slowly. Let yourself feel it, don’t just read it.</p>
    ${MAP_PARTS.map(part => html`<section class="sc-panel-card"><h2 class="sc-label">${part.num} · ${part.title}</h2><p class="sc-copy mt-2 whitespace-pre-wrap break-words">${state.map?.[part.key]}</p></section>`)}
    <button class="sc-primary" ?disabled=${state.saving || state.snapshot?.mapRead} @click=${() => propose({ kind: "mapRead" })}>${state.snapshot?.mapRead ? "✓ Read for today" : "Mark Map read for today"}</button>
    <button class="sc-secondary" ?disabled=${state.saving} @click=${() => propose({ kind: "editMap" })}>Edit my Map</button>`;
}

function courseView(state: LearningState, pillar: Pillar, propose: Propose) {
  const snapshot = state.snapshot;
  if (!snapshot) return nothing;
  const episode = EPISODES.find(item => item.id === state.episode), titles = { mindset: "Neural Map", nutrition: "Elite Body Nutrition", activity: "The 4-Day Split" };
  if (!episode) return html`<p class="sc-eyebrow">${pillar} course · Week ${snapshot.week}</p><h1 class="sc-display text-[40px] leading-none">${titles[pillar]}</h1>
    <p class="sc-copy">One episode every three weeks, alongside the other two pillars.</p>${!snapshot.setupComplete ? html`<p class="sc-copy">Complete Day 1 setup to unlock your first lesson.</p>` : nothing}
    ${pillar === "mindset" ? html`<a class="sc-panel-card border border-accent text-sm font-semibold" href="/mindset/map">Neural Map · Five-part build ›</a>` : nothing}
    ${EPISODES.filter(item => item.pillar === pillar).map(item => { const status = episodeStatus({ episode: item, snapshot }); return html`<button class="sc-panel-card text-left disabled:opacity-50" ?disabled=${status === "scheduled" || status === "blocked"} @click=${() => propose({ kind: "episodeSelected", id: item.id })}>
      <span class="block text-sm font-semibold">Week ${item.week} · ${item.title}</span><span class="sc-copy mt-1 block text-xs">${status === "done" ? "Complete · tap to review" : status === "open" ? "Start lesson" : status === "scheduled" ? `Unlocks week ${item.week}` : "Complete earlier weeks to unlock"}</span></button>`; })}`;
  const done = !!snapshot.progress.done[episode.id], url = snapshot.videoUrls[`course:${episode.id}`];
  return html`<button class="sc-secondary w-fit" ?disabled=${state.saving} @click=${() => propose({ kind: "episodeBack" })}>‹ Course</button><p class="sc-eyebrow">${pillar} · Week ${episode.week}</p><h1 class="sc-display text-[36px] leading-none">${episode.title}</h1>
    ${url ? html`<video class="w-full rounded-xl bg-sc-card" controls preload="metadata" src=${url} aria-label=${episode.title}></video>` : html`<div class="sc-panel-card"><p class="sc-label">${episode.mins} minute lesson</p><p class="sc-copy mt-2">The video has not been uploaded yet. You can read the lesson overview and work through its tasks below.</p></div>`}
    <p class="sc-copy">${episode.desc}</p><h2 class="sc-label">This week’s tasks</h2>
    ${episode.tasks.map((task, index) => html`<label class="sc-form-field"><span class="text-sm font-semibold">${task}</span><textarea class="sc-textarea" rows="3" maxlength="5000" ?readonly=${done} .value=${live(state.answers[episode.id]?.[index] ?? "")}
      @input=${(event: Event) => propose({ kind: "answerChanged", index, value: (event.target as HTMLTextAreaElement).value })}></textarea></label>`)}
    <button class="sc-primary" ?disabled=${state.saving || done} @click=${() => propose({ kind: "episodeCompleted" })}>${done ? "✓ Lesson complete" : "Mark lesson complete"}</button>`;
}

export function learningView(state: LearningState, page: "map" | Pillar, propose: Propose) {
  return html`<div class="sc-app"><div class="sc-shell gap-4 p-5"><header class="flex items-center justify-between"><a class="sc-copy py-2 underline" href="/" aria-disabled=${state.saving} @click=${(event: Event) => { if (state.saving) event.preventDefault(); }}>‹ Scorecard</a><p class="sc-eyebrow">Elite Body System</p></header>
    <p class="sc-copy text-xs" aria-live="polite" data-testid="learning-save-status">${state.saving ? "Saving your progress…" : state.error ? "Changes not saved" : "Progress saved to your account"}</p>
    ${state.error ? html`<p class="sc-error" role="alert">${state.error}</p><div class="flex gap-2"><button class="sc-secondary" @click=${() => propose({ kind: "retry" })}>Retry</button><button class="sc-secondary" @click=${() => propose({ kind: "reload" })}>Reload saved version</button></div>` : nothing}
    ${!state.snapshot ? html`<p class="sc-copy" role="status">Loading your learning progress…</p>` : page === "map" ? state.editingMap ? mapBuilder(state, propose) : mapReading(state, propose) : courseView(state, page, propose)}
    ${state.message ? html`<p class="sc-copy" role="status">${state.message}</p>` : nothing}
  </div></div>`;
}
