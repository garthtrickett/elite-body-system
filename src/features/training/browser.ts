import { render } from "lit-html";
import { createSamRuntime } from "../../shared/sam-runtime.ts";
import { createClientTransport } from "../../shared/browser-http.ts";
import { parseTrainingSnapshot } from "./data.ts";
import { initialTrainingModel, acceptTrainingProposal, representTraining } from "./browser-model.ts";
import type { TrainingProposal, TrainingEffect, TrainingModel, TrainingState } from "./browser-model.ts";
import { trainingView } from "./browser-view.ts";

export { initialTrainingModel, acceptTrainingProposal, representTraining } from "./browser-model.ts";
export type { TrainingProposal, TrainingEffect, TrainingModel, TrainingState } from "./browser-model.ts";
export { parseWorkout, emptyWorkout, planFor, workoutStats } from "./data.ts";

export function mountTraining(root: HTMLElement, config: Readonly<{ csrf: string }>) {
  const call = createClientTransport({ csrf: config.csrf, send: fetch });
  const requestedDate = new URLSearchParams(location.search).get("date") ?? "";
  let shownSelection = "";
  const alignSelection = () => {
    const strip = root.querySelector<HTMLElement>(".sc-workout-list"), selected = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!strip || !selected || strip.scrollWidth <= strip.clientWidth) return;
    const list = strip.getBoundingClientRect(), card = selected.getBoundingClientRect();
    const adjustment = card.left < list.left ? card.left - list.left : card.right > list.right ? card.right - list.right : 0;
    if (adjustment) strip.scrollBy({ left: adjustment, behavior: "instant" });
  };
  const runtime = createSamRuntime<TrainingModel, TrainingProposal, TrainingState, TrainingEffect>({
    initial: initialTrainingModel({ now: Date.now() }), accept: acceptTrainingProposal, represent: representTraining, next: model => model.pending,
    present: state => {
      render(trainingView(state, proposal => runtime.propose(proposal)), root);
      const selection = `${state.workout?.date ?? ""}:${state.selected}`;
      if (selection !== shownSelection) { shownSelection = selection; alignSelection(); }
    },
    failed: effect => ({ kind: "failed", id: effect.id }),
    perform: async effect => effect.kind === "load"
      ? { kind: "loaded", id: effect.id, result: await call({ path: `/api/client/training${effect.date || requestedDate ? `?date=${encodeURIComponent(effect.date || requestedDate)}` : ""}`, parse: parseTrainingSnapshot }) }
      : { kind: "saved", id: effect.id, result: await call({ path: "/api/client/training", body: { revision: effect.revision, workout: effect.workout, finish: effect.finish }, parse: parseTrainingSnapshot }) },
  });
  const tick = window.setInterval(() => runtime.propose({ kind: "clockTicked", now: Date.now() }), 1000);
  const protectUnsaved = (event: BeforeUnloadEvent) => { const model = runtime.getModel(); if (model.generation > model.saved || model.finishRequested) event.preventDefault(); };
  window.addEventListener("beforeunload", protectUnsaved);
  window.addEventListener("resize", alignSelection);
  runtime.propose({ kind: "started" });
  return { dispose: () => { clearInterval(tick); window.removeEventListener("beforeunload", protectUnsaved); window.removeEventListener("resize", alignSelection); runtime.dispose(); } } as const;
}
