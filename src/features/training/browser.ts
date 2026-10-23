import { trainingNavigation } from "./browser-model.ts";
export { trainingNavigation } from "./browser-model.ts";
import type { RouteHost } from "../../shared/browser-route.ts";
import { render } from "lit-html";
import { createSamRuntime } from "../../shared/sam-runtime.ts";
import { createClientTransport } from "../../shared/browser-http.ts";
import { parseTrainingSnapshot } from "./data.ts";
import { initialTrainingModel, acceptTrainingProposal, representTraining } from "./browser-model.ts";
import type { TrainingProposal, TrainingEffect, TrainingModel, TrainingState } from "./browser-model.ts";
import { trainingView } from "./browser-view.ts";

export { initialTrainingModel, acceptTrainingProposal, representTraining, hasUnsavedTraining } from "./browser-model.ts";
export type { TrainingProposal, TrainingEffect, TrainingModel, TrainingState } from "./browser-model.ts";
export { parseWorkout, emptyWorkout, planFor, workoutStats } from "./data.ts";

export function mountTraining(root: HTMLElement, config: RouteHost & Readonly<{ csrf: string }>) {
  const scope = new AbortController();
  const call = createClientTransport({ csrf: config.csrf, send: fetch, signal: scope.signal });
  const requestedDate = new URLSearchParams(location.search).get("date") ?? "";
  let loadedDate: string | undefined;
  let shownSelection = "", shownFieldErrors = "", shownRest = false;
  const alignSelection = () => {
    const strip = root.querySelector<HTMLElement>(".sc-workout-list"), selected = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!strip || !selected || strip.scrollWidth <= strip.clientWidth) return;
    const list = strip.getBoundingClientRect(), card = selected.getBoundingClientRect();
    const adjustment = card.left < list.left ? card.left - list.left : card.right > list.right ? card.right - list.right : 0;
    if (adjustment) strip.scrollBy({ left: adjustment, behavior: "instant" });
  };
  const runtime = createSamRuntime<TrainingModel, TrainingProposal, TrainingState, TrainingEffect>({
    initial: initialTrainingModel({ now: Date.now(), compact: window.innerWidth < 1024 }), accept: acceptTrainingProposal, represent: representTraining, next: model => model.pending,
    present: state => {
      config.navigationChanged(trainingNavigation(state));
      if (state.workout && !state.loading && state.failedLoadDate === undefined) {
        if (loadedDate && loadedDate !== state.workout.date) config.replaceQuery("date", state.workout.date);
        loadedDate = state.workout.date;
      }
      render(trainingView(state, proposal => runtime.propose(proposal)), root);
      if (state.remaining > 0 && !shownRest && state.compact && document.activeElement instanceof HTMLElement && root.contains(document.activeElement)) {
        document.activeElement.scrollIntoView({ block: "center", behavior: "instant" });
      }
      shownRest = state.remaining > 0;
      const errors = JSON.stringify(state.fieldErrors);
      if (errors !== shownFieldErrors && document.activeElement instanceof HTMLElement && document.activeElement.matches('[aria-invalid="true"]')) {
        document.activeElement.closest("td")?.scrollIntoView({ block: "center", behavior: "instant" });
      }
      shownFieldErrors = errors;
      const selection = `${state.workout?.date ?? ""}:${state.selected}`;
      if (selection !== shownSelection) { shownSelection = selection; alignSelection(); }
    },
    failed: effect => ({ kind: "failed", id: effect.id }),
    perform: async effect => {
      if (effect.kind === "confirmReload") return { kind: "reloadConfirmed", id: effect.id, discard: window.confirm("Reload the saved workout and discard your unsaved changes? Cancel to keep your workout and retry saving.") };
      return effect.kind === "load"
        ? { kind: "loaded", id: effect.id, result: await call({ path: `/api/client/training${effect.date || requestedDate ? `?date=${encodeURIComponent(effect.date || requestedDate)}` : ""}`, parse: parseTrainingSnapshot }) }
        : { kind: "saved", id: effect.id, result: await call({ path: "/api/client/training", body: { revision: effect.revision, workout: effect.workout, finish: effect.finish }, parse: parseTrainingSnapshot }) };
    },
  });
  const tick = window.setInterval(() => runtime.propose({ kind: "clockTicked", now: Date.now() }), 1000);
  const protectUnsaved = (event: BeforeUnloadEvent) => { if (trainingNavigation(runtime.getModel()).kind !== "ready") { event.preventDefault(); event.returnValue = ""; } };
  window.addEventListener("beforeunload", protectUnsaved);
  const resized = () => { runtime.propose({ kind: "viewportChanged", compact: window.innerWidth < 1024 }); alignSelection(); };
  window.addEventListener("resize", resized);
  runtime.propose({ kind: "started" });
  return { navigation: () => trainingNavigation(runtime.getModel()), dispose: () => { scope.abort(); clearInterval(tick); window.removeEventListener("beforeunload", protectUnsaved); window.removeEventListener("resize", resized); runtime.dispose(); } } as const;
}
