import { render } from "lit-html";
import { createSamRuntime } from "../../shared/sam-runtime.ts";
import { createClientTransport } from "../../shared/browser-http.ts";
import { parseLearningSnapshot } from "./data.ts";
import { initialLearningModel, acceptLearningProposal, representLearning } from "./browser-model.ts";
import type { LearningModel, LearningProposal, LearningState, LearningEffect } from "./browser-model.ts";
import type { Pillar } from "./courses.ts";
import { learningView } from "./browser-view.ts";

export { initialLearningModel, acceptLearningProposal, representLearning } from "./browser-model.ts";
export type { LearningModel, LearningProposal, LearningEffect } from "./browser-model.ts";
export function mountLearning(root: HTMLElement, config: Readonly<{ csrf: string; page: "map" | Pillar }>) {
  const call = createClientTransport({ csrf: config.csrf, send: fetch });
  let shownContext = "", completionAttempt = 0;
  const runtime = createSamRuntime<LearningModel, LearningProposal, LearningState, LearningEffect>({
    initial: initialLearningModel(), accept: acceptLearningProposal, represent: representLearning, next: model => model.pending,
    present: state => {
      render(learningView(state, config.page, proposal => runtime.propose(proposal)), root);
      const context = state.snapshot ? config.page === "map" ? `map:${state.editingMap}:${state.map?.step}` : `episode:${state.episode ?? "list"}` : "";
      if (context !== shownContext) {
        shownContext = context;
        const start = root.querySelector<HTMLElement>(config.page === "map" ? ".sc-map-context h1, .sc-page h1" : state.episode ? ".sc-lesson" : ".sc-course-list-heading h1");
        if (start) { start.tabIndex = -1; start.focus({ preventScroll: true }); start.scrollIntoView({ block: "start", behavior: "instant" }); }
      }
      if (state.completionAttempt !== completionAttempt) {
        completionAttempt = state.completionAttempt;
        const field = root.querySelector<HTMLElement>('[aria-invalid="true"]');
        field?.focus({ preventScroll: true }); field?.scrollIntoView({ block: "center", behavior: "instant" });
      }
    },
    failed: effect => ({ kind: "failed", id: effect.id }),
    perform: async effect => {
      if (effect.kind === "confirmReload") return { kind: "reloadConfirmed", id: effect.id, discard: window.confirm("Reload the saved version and discard your unsaved learning changes? Cancel to keep your draft and retry saving.") };
      if (effect.kind === "load") return { kind: "completed", id: effect.id, effectKind: effect.kind, result: await call({ path: "/api/client/learning", parse: parseLearningSnapshot }) };
      if (effect.kind === "readMap") return { kind: "completed", id: effect.id, effectKind: effect.kind, result: await call({ path: "/api/client/learning/read-map", body: {}, parse: parseLearningSnapshot }) };
      await new Promise(resolve => setTimeout(resolve, 300));
      return { kind: "completed", id: effect.id, effectKind: effect.kind, result: await call({ path: effect.kind === "saveMap" ? "/api/client/learning/map" : "/api/client/learning/episode",
        body: effect.kind === "saveMap" ? { map: effect.map, revision: effect.revision, finish: effect.finish } : { id: effect.episode, answers: effect.answers, revision: effect.revision, complete: effect.complete }, parse: parseLearningSnapshot }) };
    },
  });
  const protectUnsaved = (event: BeforeUnloadEvent) => { const model = runtime.getModel(); if (model.mapGeneration > model.mapSaved || model.episodeGeneration > model.episodeSaved || model.finishMap || model.completeEpisode) event.preventDefault(); };
  window.addEventListener("beforeunload", protectUnsaved);
  runtime.propose({ kind: "started" });
  return { dispose: () => { window.removeEventListener("beforeunload", protectUnsaved); runtime.dispose(); } } as const;
}
