import { EPISODES } from "./courses.ts";
import { MAP_STEPS } from "./map-content.ts";
import type { MapKey } from "./map-content.ts";
import { episodeStatus, mapWritten } from "./data.ts";
import type { LearningSnapshot, NeuralMap } from "./data.ts";
import type { ClientResult } from "../profile/browser.ts";

export type LearningEffect = Readonly<{ id: number }> & (
  | Readonly<{ kind: "load" }>
  | Readonly<{ kind: "confirmReload" }>
  | Readonly<{ kind: "readMap" }>
  | Readonly<{ kind: "saveMap"; map: NeuralMap; revision: number; generation: number; finish: boolean }>
  | Readonly<{ kind: "saveEpisode"; episode: string; answers: readonly string[]; revision: number; generation: number; complete: boolean }>
);
export type LearningModel = Readonly<{
  snapshot: LearningSnapshot | undefined; map: NeuralMap | undefined; editingMap: boolean;
  episode: string | undefined; answers: Readonly<Record<string, readonly string[]>>;
  mapGeneration: number; mapSaved: number; episodeGeneration: number; episodeSaved: number;
  finishMap: boolean; completeEpisode: boolean; readRequested: boolean; dirtyEpisode: string | undefined;
  completionAttempt: number; sequence: number; pending: LearningEffect | undefined; error: string; message: string;
}>;
export type LearningProposal =
  | Readonly<{ kind: "started" | "retry" | "reload" | "editMap" | "mapNext" | "mapBack" | "mapFinished" | "mapRead" | "episodeBack" | "episodeCompleted" }>
  | Readonly<{ kind: "mapChanged"; key: MapKey; value: string }>
  | Readonly<{ kind: "episodeSelected"; id: string }>
  | Readonly<{ kind: "answerChanged"; index: number; value: string }>
  | Readonly<{ kind: "completed"; id: number; effectKind: LearningEffect["kind"]; result: ClientResult<LearningSnapshot> }>
  | Readonly<{ kind: "failed"; id: number }>
  | Readonly<{ kind: "reloadConfirmed"; id: number; discard: boolean }>;

export function initialLearningModel(): LearningModel {
  return { snapshot: undefined, map: undefined, editingMap: false, episode: undefined, answers: {}, mapGeneration: 0, mapSaved: 0, episodeGeneration: 0, episodeSaved: 0,
    finishMap: false, completeEpisode: false, readRequested: false, dirtyEpisode: undefined, completionAttempt: 0, sequence: 0, pending: undefined, error: "", message: "" };
}
function schedule(model: LearningModel, intent: Omit<Extract<LearningEffect, { kind: "load" | "readMap" | "confirmReload" }>, "id"> | Omit<Extract<LearningEffect, { kind: "saveMap" }>, "id"> | Omit<Extract<LearningEffect, { kind: "saveEpisode" }>, "id">): LearningModel {
  const id = model.sequence + 1;
  return { ...model, sequence: id, pending: { ...intent, id }, error: "", message: "" };
}
function sync(model: LearningModel): LearningModel {
  if (!model.snapshot || model.pending || model.error) return model;
  if (model.map && (model.mapGeneration > model.mapSaved || model.finishMap && mapWritten(model.map))) return schedule(model, { kind: "saveMap", map: model.map, revision: model.snapshot.mapRevision, generation: model.mapGeneration, finish: model.finishMap && mapWritten(model.map) });
  if (model.readRequested) return schedule(model, { kind: "readMap" });
  if (model.dirtyEpisode && (model.episodeGeneration > model.episodeSaved || model.completeEpisode)) return schedule(model,
    { kind: "saveEpisode", episode: model.dirtyEpisode, answers: model.answers[model.dirtyEpisode] ?? [], revision: model.snapshot.progressRevision, generation: model.episodeGeneration, complete: model.completeEpisode });
  return model;
}

export function acceptLearningProposal(model: LearningModel, proposal: LearningProposal): LearningModel {
  switch (proposal.kind) {
    case "started": return model.sequence ? model : schedule(model, { kind: "load" });
    case "reload": return model.pending ? model : model.mapGeneration > model.mapSaved || model.episodeGeneration > model.episodeSaved || model.finishMap || model.completeEpisode
      ? { ...schedule(model, { kind: "confirmReload" }), error: model.error } : schedule(model, { kind: "load" });
    case "reloadConfirmed": return model.pending?.kind !== "confirmReload" || model.pending.id !== proposal.id ? model
      : proposal.discard ? schedule(model, { kind: "load" }) : { ...model, pending: undefined, message: "Your unsaved changes were kept." };
    case "retry": return model.pending ? model : model.snapshot ? sync({ ...model, error: "" }) : schedule(model, { kind: "load" });
    case "failed": return model.pending?.id === proposal.id ? { ...model, pending: undefined, error: "Your learning progress could not be saved. Try again." } : model;
    case "completed": {
      if (model.pending?.id !== proposal.id || model.pending.kind !== proposal.effectKind) return model;
      if (!proposal.result.ok) return { ...model, pending: undefined, error: proposal.result.error.message };
      const value = proposal.result.value, effect = model.pending;
      if (effect.kind === "confirmReload") return model;
      if (effect.kind === "load") return { ...model, snapshot: value, map: value.map, editingMap: !mapWritten(value.map), answers: value.progress.answers, pending: undefined,
        mapGeneration: 0, mapSaved: 0, episodeGeneration: 0, episodeSaved: 0, error: "", message: "", finishMap: false, completeEpisode: false, readRequested: false, dirtyEpisode: undefined };
      if (effect.kind === "saveMap") return sync({ ...model, snapshot: value, pending: undefined, mapSaved: effect.generation,
        finishMap: effect.finish && effect.generation === model.mapGeneration ? false : model.finishMap, editingMap: effect.finish && effect.generation === model.mapGeneration ? false : model.editingMap, message: "Map saved to your account." });
      if (effect.kind === "readMap") return sync({ ...model, snapshot: value, pending: undefined, readRequested: false, message: "Map read for today." });
      return sync({ ...model, snapshot: value, pending: undefined, episodeSaved: effect.generation,
        completeEpisode: effect.complete ? false : model.completeEpisode, message: effect.complete ? "Lesson complete." : "Answers saved." });
    }
  }
  if (!model.snapshot || !model.map || model.pending?.kind === "load") return model;
  switch (proposal.kind) {
    case "editMap": return { ...model, editingMap: true, error: "" };
    case "mapChanged": return proposal.value.length <= 5000 ? sync({ ...model, map: { ...model.map, [proposal.key]: proposal.value }, mapGeneration: model.mapGeneration + 1, finishMap: false, error: "" }) : model;
    case "mapNext": {
      const step = MAP_STEPS[model.map.step];
      if (step?.keys?.some(key => !model.map?.[key].trim())) return { ...model, error: "Write this part before continuing." };
      return sync({ ...model, map: { ...model.map, step: Math.min(6, model.map.step + 1) }, mapGeneration: model.mapGeneration + 1, error: "" });
    }
    case "mapBack": return sync({ ...model, map: { ...model.map, step: Math.max(0, model.map.step - 1) }, mapGeneration: model.mapGeneration + 1, error: "" });
    case "mapFinished": return mapWritten(model.map) ? sync({ ...model, finishMap: true, error: "" }) : { ...model, error: "Write every part before finishing your Map." };
    case "mapRead": return mapWritten(model.map) ? sync({ ...model, readRequested: true, error: "" }) : { ...model, error: "Finish writing your Map before marking it read." };
    case "episodeSelected": {
      const episode = EPISODES.find(item => item.id === proposal.id);
      if (!episode) return model;
      const status = episodeStatus({ episode, snapshot: model.snapshot });
      return status === "open" || status === "done" ? { ...model, episode: episode.id, completionAttempt: 0, error: "" } : { ...model, error: "Complete earlier weeks and wait for this lesson’s scheduled week." };
    }
    case "episodeBack": return model.pending || model.episodeGeneration > model.episodeSaved ? model : { ...model, episode: undefined, error: "", message: "" };
    case "answerChanged": {
      const episode = EPISODES.find(item => item.id === model.episode);
      if (!episode || model.snapshot.progress.done[episode.id] || model.pending?.kind === "saveEpisode" && model.pending.complete || proposal.index < 0 || proposal.index >= episode.tasks.length || proposal.value.length > 5000) return model;
      const answers = episode.tasks.map((_, index) => index === proposal.index ? proposal.value : model.answers[episode.id]?.[index] ?? "");
      return sync({ ...model, answers: { ...model.answers, [episode.id]: answers }, dirtyEpisode: episode.id, episodeGeneration: model.episodeGeneration + 1, error: "" });
    }
    case "episodeCompleted": {
      const episode = EPISODES.find(item => item.id === model.episode);
      if (!episode || !episode.tasks.every((_, index) => model.answers[episode.id]?.[index]?.trim())) return { ...model, completionAttempt: model.completionAttempt + 1, error: "Answer every task before completing the lesson." };
      return sync({ ...model, completeEpisode: true, dirtyEpisode: episode.id, error: "" });
    }
  }
}
export function representLearning(model: LearningModel) {
  const episode = EPISODES.find(item => item.id === model.episode);
  const missingAnswers = model.completionAttempt && episode ? episode.tasks.flatMap((_, index) => model.answers[episode.id]?.[index]?.trim() ? [] : [index]) : [];
  return { ...model, missingAnswers, saving: model.pending !== undefined || model.mapGeneration > model.mapSaved || model.episodeGeneration > model.episodeSaved,
    written: model.map ? mapWritten(model.map) : false } as const;
}
export type LearningState = ReturnType<typeof representLearning>;
