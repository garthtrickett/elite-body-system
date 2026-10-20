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
  const runtime = createSamRuntime<LearningModel, LearningProposal, LearningState, LearningEffect>({
    initial: initialLearningModel(), accept: acceptLearningProposal, represent: representLearning, next: model => model.pending,
    present: state => render(learningView(state, config.page, proposal => runtime.propose(proposal)), root),
    failed: effect => ({ kind: "failed", id: effect.id }),
    perform: async effect => {
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
