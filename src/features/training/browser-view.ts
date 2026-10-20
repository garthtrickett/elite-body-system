import { html, nothing } from "lit-html";
import { live } from "lit-html/directives/live.js";
import type { Exercise } from "./catalog.ts";
import { PROGRAM, WEEK, SET_METHODS } from "./catalog.ts";
import { INSTRUCTIONS, MASTER_CUES } from "./instructions.ts";
import type { TrainingProposal, TrainingState } from "./browser-model.ts";

export const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
type Propose = (proposal: TrainingProposal) => void;

function setRows(state: TrainingState, exercise: Exercise, propose: Propose) {
  const workout = state.workout;
  if (!workout) return nothing;
  return html`<table class="w-full text-sm"><thead><tr class="sc-label"><th scope="col">Set</th><th scope="col">Reps</th><th scope="col">Weight (kg)</th><th scope="col">Done</th></tr></thead><tbody>
    ${Array.from({ length: exercise.sets ?? 0 }, (_, slot) => {
      const set = workout.sets[exercise.id]?.[slot];
      const previous = state.snapshot?.history.filter(w => w.date !== workout.date && w.finishedAt).find(w => w.sets[exercise.id]?.[slot]?.done)?.sets[exercise.id]?.[slot];
      return html`<tr class=${set?.done ? "bg-accent/10" : ""}><th class="p-2 font-normal" scope="row">${slot + 1}</th>
        ${(["reps", "kg"] as const).map(field => html`<td class="p-1"><input class="sc-textarea w-full px-2 py-3 text-center" inputmode=${field === "kg" ? "decimal" : "numeric"} maxlength="8"
          aria-label=${`${exercise.name} set ${slot + 1} ${field === "kg" ? "weight" : "reps"}`}
          placeholder=${String(previous?.[field] ?? (field === "reps" ? parseInt(exercise.reps ?? "1", 10) : 0))}
          .value=${live(state.drafts[`${exercise.id}:${slot}:${field}`] ?? (set?.[field] ? String(set[field]) : ""))}
          @input=${(event: Event) => propose({ kind: "setChanged", id: exercise.id, slot, field, value: (event.target as HTMLInputElement).value })}
          @blur=${() => { if (state.drafts[`${exercise.id}:${slot}:${field}`] !== undefined) propose({ kind: "setCommitted", id: exercise.id, slot, field }); }}
          @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); propose({ kind: "setCommitted", id: exercise.id, slot, field }); } }}></td>`)}
        <td class="p-1 text-center"><button class="sc-icon-button ${set?.done ? "text-accent" : "text-sc-muted"}" aria-label=${`Complete set ${slot + 1} for ${exercise.name}`} aria-pressed=${set?.done ?? false}
          @click=${() => propose({ kind: "setToggled", id: exercise.id, slot })}>✓</button>
          ${state.stats.records.includes(`${exercise.id}:${slot}`) ? html`<span class="text-[10px] font-bold text-accent">PR</span>` : nothing}</td></tr>`;
    })}</tbody></table>`;
}

function exerciseLog(state: TrainingState, exercise: Exercise, propose: Propose) {
  if (!state.workout) return nothing;
  return html`${exercise.cardio ? html`<label class="sc-form-field"><span class="sc-label">Minutes of ${exercise.name}</span><input class="sc-textarea" type="number" min="0" max="600" .value=${live(String(state.workout.cardio[exercise.id] || ""))}
      placeholder=${String(exercise.target ?? 30)} @input=${(event: Event) => propose({ kind: "cardioChanged", id: exercise.id, value: (event.target as HTMLInputElement).value })}></label>`
    : exercise.checklist ? html`<div class="space-y-3">${exercise.checklist.map((label, index) => html`<label class="flex items-center gap-3 text-sm"><input type="checkbox" .checked=${state.workout?.mobility[exercise.id]?.[index] ?? false}
      @change=${() => propose({ kind: "mobilityToggled", id: exercise.id, index })}>${label}</label>`)}</div>` : setRows(state, exercise, propose)}
    ${exercise.rest ? html`<button class="sc-secondary mt-3" @click=${() => propose({ kind: "restStarted", seconds: exercise.rest ?? 60 })}>Start rest · ${formatTime(exercise.rest)}</button>` : nothing}
    <label class="sc-form-field mt-4"><span class="sc-label">Your notes for ${exercise.name}</span><textarea class="sc-textarea" rows="2" maxlength="2000" .value=${live(state.workout.notes[exercise.id] ?? "")}
      @input=${(event: Event) => propose({ kind: "noteChanged", id: exercise.id, value: (event.target as HTMLTextAreaElement).value })}></textarea></label>`;
}

function exerciseDetail(state: TrainingState, base: Exercise, exercise: Exercise, propose: Propose) {
  const how = INSTRUCTIONS[exercise.id], url = state.snapshot?.videoUrls[`exercise:${exercise.id}`];
  const tempo = exercise.cardio || exercise.checklist || exercise.type.includes("EMOM") ? "" : exercise.type === "Eccentric Set" ? "3110" : exercise.role === "own" && (exercise.rest ?? 0) >= 150 ? "20X0" : "3010";
  return html`<section class="sc-panel-card space-y-4"><h2 class="sc-display text-3xl">${exercise.name}</h2><p class="sc-copy text-xs">${exercise.type} · ${exercise.muscle} · ${exercise.reps ?? exercise.note ?? ""}</p><p class="sc-copy text-xs">${exercise.role === "own" ? "Own this lift: progress with control." : exercise.role === "capped" ? "Capped: keep effort within the prescription." : exercise.note ?? ""}${tempo ? ` · Tempo ${tempo} (lower, pause, lift, pause; X = explosive)` : ""}</p>
    <div class="flex gap-2" role="group" aria-label="Exercise views">${(["history", "log", "instructions"] as const).map(tab => html`<button class="sc-choice ${state.tab === tab ? "sc-choice-selected" : ""}" aria-pressed=${state.tab === tab} @click=${() => propose({ kind: "tabSelected", tab })}>${tab === "log" ? "Log" : tab === "history" ? "History" : "Instructions"}</button>`)}</div>
    ${state.tab === "log" ? html`<p class="sc-copy text-xs">${SET_METHODS[exercise.type]}</p>${base.alt ? html`<button class="sc-secondary" @click=${() => propose({ kind: "swapToggled", id: base.id })}>Swap to ${state.workout?.swaps[base.id] ? base.name : base.alt.name}</button>` : nothing}
      <fieldset class="min-w-0" ?disabled=${state.snapshot?.readOnly || state.loading}>${exerciseLog(state, exercise, propose)}</fieldset>`
    : state.tab === "instructions" ? html`<p class="sc-eyebrow">${MASTER_CUES[exercise.id] ?? "Move with control."}</p>${how ? html`<dl class="space-y-3">${([ ["Set up", how.start], ["Move", how.move], ["Return", how.ret], ["Keep in mind", how.tips] ] as const).map(([title, text]) => html`<div><dt class="sc-label">${title}</dt><dd class="sc-copy">${text}</dd></div>`)}</dl>` : nothing}${url ? html`<video class="w-full rounded-xl" controls preload="metadata" src=${url} aria-label=${`${exercise.name} demonstration`}></video>` : html`<p class="sc-copy text-xs">Demo video has not been uploaded yet.</p>`}`
    : html`<h3 class="sc-label">Previous completed sessions</h3>${state.snapshot?.history.filter(w => w.date !== state.workout?.date && w.finishedAt && w.sets[exercise.id]?.some(set => set.done)).slice(0, 12).map(workout => html`<div class="border-t border-white/10 pt-3"><p class="text-sm font-bold">${workout.date}</p><p class="sc-copy">${workout.sets[exercise.id]?.filter(set => set.done).map(set => `${set.kg} kg × ${set.reps}`).join(" · ")}</p><p class="sc-copy text-xs">${workout.notes[exercise.id] ?? ""}</p></div>`)}
      ${!state.snapshot?.history.some(w => w.date !== state.workout?.date && w.finishedAt && w.sets[exercise.id]?.some(set => set.done)) ? html`<p class="sc-copy">Your completed sets will appear here after your first session.</p>` : nothing}`}
  </section>`;
}

export function trainingView(state: TrainingState, propose: Propose) {
  const workout = state.workout, day = workout ? WEEK[workout.planKey] : undefined;
  const bases = workout ? PROGRAM[workout.planKey] ?? [] : [];
  const selectedIndex = bases.findIndex(exercise => exercise.id === state.selected);
  const selectedBase = bases[selectedIndex], selected = state.exercises[selectedIndex];
  return html`<div class="sc-app"><div class="sc-shell gap-4 p-5">
    <header class="flex items-center justify-between"><a class="sc-copy py-2 underline" href="/" aria-disabled=${state.saving} @click=${(event: Event) => { if (state.saving) event.preventDefault(); }}>‹ Scorecard</a><p class="sc-eyebrow">Elite Body System</p></header>
    <div class="flex items-baseline justify-between gap-2"><h1 class="sc-display text-[40px] leading-none">${day?.name ?? "Your training"}</h1><span class="sc-display text-2xl text-sc-muted" aria-label="Workout elapsed time">${formatTime(state.elapsed)}</span></div>
    <p class="sc-copy text-xs">Foundation program · follows your chosen training days</p>
    ${workout ? html`<label class="sc-form-field"><span class="sc-label">Workout date</span><input class="sc-textarea" type="date" .value=${workout.date} ?disabled=${state.pending !== undefined} @change=${(event: Event) => propose({ kind: "dateSelected", date: (event.target as HTMLInputElement).value })}></label>` : nothing}
    ${state.error ? html`<p class="sc-error" role="alert">${state.error}</p><div class="flex gap-2"><button class="sc-secondary" @click=${() => propose({ kind: "retry" })}>Retry</button><button class="sc-secondary" @click=${() => propose({ kind: "reload" })}>Reload saved workout</button></div>` : nothing}
    ${!state.snapshot ? html`<p class="sc-copy" role="status">Loading your workout…</p>` : state.snapshot.blocked ? html`<h2 class="sc-display text-3xl">${state.snapshot.blocked === "setup_required" ? "Set up your week first." : "Clearance first."}</h2><p class="sc-copy">${state.snapshot.blocked === "setup_required" ? "Complete your Day 1 setup to build your training week." : "You flagged a health concern. Confirm your doctor’s clearance in your profile before training."}</p><a class="sc-primary text-center" href="/">Back to your profile and scorecard</a>`
    : day?.rest ? html`<p class="sc-copy">Programmed rest. Recovery is where the work turns into results.</p><a class="sc-primary text-center" href="/">Back to scorecard</a>`
    : html`${state.snapshot.readOnly ? html`<p class="sc-copy">Future session preview. Logging becomes available on this date.</p>` : nothing}
      <p class="sc-copy text-xs" data-testid="training-save-status" aria-live="polite">${state.saving ? "Saving workout…" : state.error ? "Changes not saved" : "Workout saved to your account"}</p>
      ${workout?.restUntil ? html`<section class="sc-panel-card border border-accent/30"><div class="flex items-center justify-between"><h2 class="sc-label">Rest</h2><span class="sc-display text-4xl text-accent" aria-label="Rest remaining">${formatTime(state.remaining)}</span></div>
        ${state.remaining === 0 ? html`<p role="status" class="text-sm text-accent">Rest complete.</p>` : nothing}<div class="mt-2 flex gap-2"><button class="sc-secondary" @click=${() => propose({ kind: "restExtended", seconds: 30 })}>+30 seconds</button><button class="sc-secondary" @click=${() => propose({ kind: "restSkipped" })}>Skip rest</button></div></section>` : nothing}
      <div class="flex flex-col gap-2">${bases.map((base, i) => html`<button class="sc-panel-card text-left ${state.selected === base.id ? "border border-accent/50" : ""}" @click=${() => propose({ kind: "exerciseSelected", id: base.id })}><span class="block font-semibold">${state.exercises[i]?.name}</span><span class="sc-copy text-xs">${base.sets ? `${base.sets} sets · ${base.reps} reps` : base.type}</span></button>`)}</div>
      ${selected && selectedBase ? exerciseDetail(state, selectedBase, selected, propose) : nothing}
      <div class="sc-panel-card"><p class="sc-label">This session</p><p class="sc-copy mt-2">${state.stats.sets} sets · ${Math.round(state.stats.volume)} kg moved · ${state.stats.records.length} PRs</p></div>
      <button class="sc-primary" ?disabled=${state.saving || state.snapshot.readOnly || !!workout?.finishedAt} @click=${() => propose({ kind: "finish" })}>${workout?.finishedAt ? "✓ Workout complete" : "Finish workout"}</button>`}
  </div></div>`;
}
