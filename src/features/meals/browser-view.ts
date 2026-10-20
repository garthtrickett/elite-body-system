import { html, nothing } from "lit-html";
import { workspace } from "../../shared/browser-layout.ts";
import { live } from "lit-html/directives/live.js";
import type { MealProposal, MealState } from "./browser-model.ts";
import { MACROS, MICROS, mealTotals } from "./data.ts";
import type { Macro, Micro } from "./data.ts";
type Actions = Readonly<{ propose: (proposal: MealProposal) => void; photos: (files: FileList | null) => void; log: () => void }>;
const names: Readonly<Record<Macro | Micro, string>> = { energy: "Calories", protein: "Protein", carbs: "Carbs", fat: "Fat", fibre: "Fibre", iron: "Iron", potassium: "Potassium", vitaminC: "Vitamin C" };
const unit = (key: Macro | Micro) => key === "energy" ? "kcal" : key === "iron" || key === "potassium" || key === "vitaminC" ? "mg" : "g";
function reviewView(state: MealState, actions: Actions) {
  const meal = state.draft; if (!meal) return nothing;
  return html`<p class="sc-eyebrow">Review before logging</p><h1 class="sc-display text-[42px] leading-[1.1]">Make it yours.</h1>
    <p class="sc-copy">Check portions and ingredients, including oils and sauces. Photo portions and AI nutrition are estimates. No food database lookup has been performed.</p>
    <fieldset class="contents" ?disabled=${state.locked}>
      <label class="sc-form-field"><span class="sc-label">Meal name</span><input class="sc-textarea" maxlength="100" .value=${live(meal.name)} @input=${(e: Event) => actions.propose({ kind: "draftNamed", value: (e.target as HTMLInputElement).value })}></label>
      <label class="sc-form-field"><span class="sc-label">Notes and assumptions</span><textarea class="sc-textarea" rows="3" maxlength="2000" .value=${live(meal.note)} @input=${(e: Event) => actions.propose({ kind: "draftNoted", value: (e.target as HTMLTextAreaElement).value })}></textarea></label>
      ${meal.items.map((item, index) => {
        const nutrient = (field: Macro | Micro) => html`<label class="sc-form-field"><span class="text-xs text-sc-muted">${names[field]} (${unit(field)})</span><input class="sc-textarea min-w-0" inputmode="decimal" aria-label=${`${names[field]} per 100g for ingredient ${index + 1}`}
          .value=${live(state.fields[`${index}:${field}`] ?? (item.per100[field] === null ? "" : String(item.per100[field])))}
          @input=${(e: Event) => actions.propose({ kind: "fieldChanged", index, field, value: (e.target as HTMLInputElement).value })} @change=${() => actions.propose({ kind: "fieldCommitted", index, field })}></label>`;
        return html`<section class="sc-panel-card space-y-3"><div class="flex items-center justify-between gap-3"><h2 class="sc-label">Ingredient ${index + 1}</h2><button class="sc-copy text-xs underline" ?disabled=${meal.items.length === 1} @click=${() => actions.propose({ kind: "ingredientRemoved", index })}>Remove ingredient ${index + 1}</button></div>
          <label class="sc-form-field"><span class="sr-only">Ingredient ${index + 1} name</span><input class="sc-textarea" aria-label=${`Ingredient ${index + 1} name`} maxlength="120" .value=${live(item.name)} @input=${(e: Event) => actions.propose({ kind: "ingredientNamed", index, value: (e.target as HTMLInputElement).value })}></label>
          <label class="sc-form-field"><span class="sc-label">Portion (g)</span><input class="sc-textarea" inputmode="decimal" aria-label=${`Portion for ingredient ${index + 1}`} .value=${live(state.fields[`${index}:grams`] ?? String(item.grams))}
            @input=${(e: Event) => actions.propose({ kind: "fieldChanged", index, field: "grams", value: (e.target as HTMLInputElement).value })} @change=${() => actions.propose({ kind: "fieldCommitted", index, field: "grams" })}></label>
          <p class="sc-label text-xs">Nutrition per 100 g · ${item.source === "ai_estimate" ? "AI estimate" : "Entered manually"}</p><div class="grid grid-cols-2 gap-3">${MACROS.map(nutrient)}</div>
          <details><summary class="sc-copy cursor-pointer py-2 text-xs">Fibre and micronutrients</summary><p class="sc-copy mb-3 text-xs">Leave unknown values blank.</p><div class="grid grid-cols-2 gap-3">${MICROS.map(nutrient)}</div></details></section>`;
      })}
      <button class="sc-secondary" ?disabled=${meal.items.length >= 12} @click=${() => actions.propose({ kind: "ingredientAdded" })}>+ Add ingredient</button>
      ${state.totals ? html`<section class="sc-panel-card border border-sc-border" aria-label="Meal totals"><h2 class="sc-label">Meal totals</h2><div class="mt-3 grid grid-cols-2 gap-3">${MACROS.map(key => html`<p class="sc-copy text-xs">${names[key]}<strong class="mt-1 block text-lg text-sc-ink">${state.totals?.[key]} ${unit(key)}</strong></p>`)}</div>
        <p class="sc-copy mt-3 text-xs">${MICROS.map(key => `${names[key]} ${state.totals?.[key] === null ? "unknown" : `${state.totals?.[key]} ${unit(key)}`}`).join(" · ")}</p></section>` : nothing}
      <label class="sc-copy flex items-center gap-3"><input type="checkbox" .checked=${state.favorite} @change=${(e: Event) => actions.propose({ kind: "favoriteChanged", value: (e.target as HTMLInputElement).checked })}>Save to My Meals for next time</label>
      <button class="sc-primary" @click=${actions.log}>Log meal for ${state.snapshot?.date}</button><button class="sc-secondary" @click=${() => actions.propose({ kind: "draftCancelled" })}>Cancel review</button>
    </fieldset>`;
}
function captureView(state: MealState, actions: Actions) {
  return html`<p class="sc-eyebrow">Nutrition</p><h1 class="sc-display text-[44px] leading-[1.1]">Log a Meal</h1><p class="sc-copy">Describe it, snap it, or both. Include portions, cooking method and any oils or sauces. You can use your phone keyboard’s dictation to speak the description.</p>
    <fieldset class="contents" ?disabled=${state.locked}>
      <label class="sc-form-field"><span class="sc-label">What did you eat?</span><textarea class="sc-textarea" rows="4" maxlength="4000" placeholder="150 g chicken, a cup of cooked rice, broccoli and a teaspoon of olive oil…" .value=${live(state.description)}
        @input=${(e: Event) => actions.propose({ kind: "descriptionChanged", value: (e.target as HTMLTextAreaElement).value })}></textarea></label>
      <label class="sc-upload">Add meal or label photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Meal photos" @change=${(e: Event) => { const input = e.target as HTMLInputElement; actions.photos(input.files); input.value = ""; }}></label>
      ${state.photos.length ? html`<div class="grid grid-cols-2 gap-3">${state.photos.map((photo, index) => html`<div><img class="aspect-square w-full rounded-xl object-cover" src=${`data:${photo.mediaType};base64,${photo.data}`} alt=${`Meal photo ${index + 1}`}><button class="sc-copy py-2 text-xs underline" @click=${() => actions.propose({ kind: "photoRemoved", index })}>Remove photo ${index + 1}</button></div>`)}</div>` : nothing}
      <p class="sc-copy text-xs">Only this description and selected photos are sent to OpenAI when you analyse. Photos are resized, and are not saved in your account.</p>
      <button class="sc-primary" ?disabled=${!state.snapshot?.analysisAvailable} @click=${() => actions.propose({ kind: "analysisRequested" })}>Analyse meal</button>
      ${!state.snapshot?.analysisAvailable ? html`<p class="sc-copy text-xs">AI meal analysis is not configured yet. Manual entry and My Meals are available.</p>` : nothing}
      <button class="sc-secondary" @click=${() => actions.propose({ kind: "manualRequested" })}>Enter nutrition manually</button>
      <p class="sc-copy text-xs">For a whole meal with known totals, leave its portion at 100 g and enter those totals.</p>
    </fieldset>`;
}
function favoritesView(state: MealState, actions: Actions) {
  return html`<fieldset class="sc-meal-favorites flex min-w-0 flex-col gap-3" ?disabled=${state.locked}>      <h2 class="sc-display mt-4 text-[30px]">My Meals</h2><p class="sc-copy text-xs">Your 30 most recently saved meals. Open one to adjust its portion before logging again.</p>
      ${state.snapshot?.favorites.map(entry => html`<section class="sc-panel-card"><button class="block w-full text-left" @click=${() => actions.propose({ kind: "favoriteSelected", id: entry.id })}><strong class="text-sm">${entry.meal.name} ›</strong><p class="sc-copy mt-1 text-xs">${mealTotals(entry.meal).energy} kcal · ${mealTotals(entry.meal).protein} g protein</p></button><button class="sc-copy mt-3 text-xs underline" @click=${() => actions.propose({ kind: "removeFavoriteRequested", id: entry.id })}>Remove ${entry.meal.name} from My Meals</button></section>`)}
      ${!state.snapshot?.favorites.length ? html`<p class="sc-copy text-xs">Save a meal when logging it to build your list.</p>` : nothing}
</fieldset>`;
}
export function mealsView(state: MealState, actions: Actions) {
  return workspace({ page: "meals", navigationDisabled: state.locked, content: html`<div class="sc-page"><header class="flex items-center justify-between gap-3"><a class="sc-copy py-2 underline" href="/" @click=${(e: Event) => { if (state.locked) e.preventDefault(); }}>‹ Scorecard</a><p class="sc-eyebrow">Elite Body System</p></header>
    ${state.error ? html`<p class="sc-error" role="alert">${state.error}</p>${state.retry ? html`<button class="sc-secondary" @click=${() => actions.propose({ kind: "retry" })}>Retry same action</button><button class="sc-secondary" @click=${() => actions.propose({ kind: "reload" })}>Reload saved meals</button>` : nothing}` : nothing}
    ${state.busy ? html`<p class="sc-copy" role="status">${state.pending?.kind === "analyze" ? "Analysing your meal…" : state.pending?.kind === "preparePhotos" ? "Preparing your photos…" : state.pending?.kind === "load" ? "Loading your meals…" : "Saving your meal…"}</p>` : nothing}
    ${state.message ? html`<p class="sc-copy" role="status">${state.message}</p>` : nothing}
    ${state.snapshot ? html`<label class="sc-form-field sc-date-field"><span class="sc-label">Meal date</span><input class="sc-textarea" type="date" aria-label="Meal date" ?disabled=${state.locked} .value=${live(state.snapshot.date)} @change=${(e: Event) => actions.propose({ kind: "dateChanged", value: (e.target as HTMLInputElement).value })}></label>
      <div class="sc-meal-layout"><div class="sc-meal-editor">${state.draft ? reviewView(state, actions) : captureView(state, actions)}</div>
      <div class="sc-meal-history">${!state.draft ? favoritesView(state, actions) : nothing}<section class="mt-4 space-y-3"><h2 class="sc-display text-[30px]">Logged for ${state.snapshot.date}</h2><p class="sc-copy text-xs">Logging adds calories and protein to your scorecard. Removing a meal subtracts its contribution. Manual scorecard edits are kept, with a minimum total of zero.</p>
        ${state.snapshot.entries.map(entry => html`<article class="sc-panel-card"><h3 class="text-sm font-medium">${entry.meal.name}</h3><p class="sc-copy mt-1 text-xs">${mealTotals(entry.meal).energy} kcal · ${mealTotals(entry.meal).protein} g protein</p><button class="sc-copy mt-3 text-xs underline" ?disabled=${state.locked} @click=${() => actions.propose({ kind: "removeRequested", id: entry.id })}>Remove ${entry.meal.name} from this day</button></article>`)}${!state.snapshot.entries.length ? html`<p class="sc-copy text-xs">No meals logged for this date.</p>` : nothing}</section></div></div>` : nothing}
  </div>` });
}
