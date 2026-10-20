import { render } from "lit-html";
import { createSamRuntime } from "../../shared/sam-runtime.ts";
import { createClientTransport } from "../../shared/browser-http.ts";
import { initialMealModel, acceptMealProposal, representMeals } from "./browser-model.ts";
import type { MealEffect, MealModel, MealProposal, MealState } from "./browser-model.ts";
import { parseMeal, parseMealSnapshot } from "./data.ts";
import { mealsView } from "./browser-view.ts";
import { prepareMealPhotos } from "./browser-photos.ts";
export { initialMealModel, acceptMealProposal, representMeals } from "./browser-model.ts";
export { parseMeal, parseMealSnapshot, mealTotals, emptyMeal } from "./data.ts";
export type { MealEffect, MealModel, MealProposal } from "./browser-model.ts";
export type { Meal, MealSnapshot } from "./data.ts";

export function mountMeals(root: HTMLElement, config: Readonly<{ csrf: string }>) {
  const call = createClientTransport({ csrf: config.csrf, send: fetch }), selections = new Map<number, readonly File[]>();
  let sequence = 0, reviewing = false, validationAttempt = 0, shownError: string | null = null;
  function present(state: MealState): void {
    render(mealsView(state, { propose: proposal => runtime.propose(proposal), log: () => runtime.propose({ kind: "logRequested", requestId: crypto.randomUUID() }), photos: files => {
      const selection = ++sequence; selections.set(selection, Array.from(files ?? [])); runtime.propose({ kind: "photosRequested", selection });
      const pending = runtime.getModel().pending; if (pending?.kind !== "preparePhotos" || pending.selection !== selection) selections.delete(selection);
    } }), root);
    // DOM effects follow accepted state; edits within a review never reset its scroll.
    if (state.draft && !reviewing) {
      const heading = root.querySelector<HTMLElement>(".sc-review-title");
      heading?.focus({ preventScroll: true }); heading?.scrollIntoView({ block: "start" });
    }
    reviewing = state.draft !== null;
    if (state.error && state.error !== shownError && !Object.keys(state.fieldErrors).length) {
      const feedback = root.querySelector<HTMLElement>(".sc-meal-error");
      feedback?.focus({ preventScroll: true }); feedback?.scrollIntoView({ block: "center" });
    }
    shownError = state.error;
    if (state.validationAttempt !== validationAttempt) {
      validationAttempt = state.validationAttempt;
      const field = root.querySelector<HTMLElement>('[aria-invalid="true"]');
      const feedback = field ?? root.querySelector<HTMLElement>(".sc-meal-error");
      feedback?.closest("details")?.setAttribute("open", "");
      feedback?.focus({ preventScroll: true }); feedback?.scrollIntoView({ block: "center" });
    }
  }
  const runtime = createSamRuntime<MealModel, MealProposal, MealState, MealEffect>({
    initial: initialMealModel(), accept: acceptMealProposal, represent: representMeals, next: model => model.pending ?? undefined,
    present,
    failed: effect => ({ kind: "failed", id: effect.id }),
    perform: async (effect): Promise<MealProposal> => {
      if (effect.kind === "confirmNavigation" || effect.kind === "navigate") {
        const destination = new URL(effect.href, location.origin);
        const safe = destination.origin === location.origin;
        if (effect.kind === "confirmNavigation") return { kind: "navigationConfirmed", id: effect.id,
          leave: safe && window.confirm("Discard this unfinished meal? Your changes have not been logged.") };
        if (safe) location.assign(destination.href);
        return { kind: "navigationConfirmed", id: effect.id, leave: false };
      }
      if (effect.kind === "preparePhotos") {
        const files = selections.get(effect.selection) ?? []; selections.delete(effect.selection);
        return { kind: "photosPrepared", id: effect.id, result: await prepareMealPhotos({ files, remaining: 4 - runtime.getModel().photos.length }) };
      }
      if (effect.kind === "analyze") return { kind: "analyzed", id: effect.id, result: await call({ path: "/api/client/meals/analyze", body: { description: effect.description, photos: effect.photos }, parse: value => { const parsed = parseMeal(value); return parsed.ok ? parsed.value : undefined; }, timeout: 55000 }) };
      const path = effect.kind === "load" ? `/api/client/meals${effect.date ? `?date=${encodeURIComponent(effect.date)}` : ""}` : `/api/client/meals/${effect.kind === "removeFavorite" ? "remove-favorite" : effect.kind}`;
      return { kind: "completed", id: effect.id, effectKind: effect.kind, result: await call({ path, parse: parseMealSnapshot,
        ...(effect.kind === "load" ? {} : { body: effect.kind === "log" ? { date: effect.date, requestId: effect.requestId, meal: effect.meal, favorite: effect.favorite } : { id: effect.mealId, date: effect.date } }) }) };
    },
  });
  const protectUnsaved = (event: BeforeUnloadEvent) => { const model = runtime.getModel(); if (model.pending?.kind !== "navigate" && (model.draft || model.description.trim() || model.photos.length || model.pending?.kind === "log" || model.retry?.kind === "log")) { event.preventDefault(); event.returnValue = ""; } };
  window.addEventListener("beforeunload", protectUnsaved);
  runtime.propose({ kind: "started" });
  return { dispose: () => { window.removeEventListener("beforeunload", protectUnsaved); selections.clear(); runtime.dispose(); } } as const;
}
