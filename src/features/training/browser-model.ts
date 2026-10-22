import { PROGRAM } from "./catalog.ts";
import { exercisesFor, workoutStats, setNumberProblem } from "./data.ts";
import type { Workout, TrainingSnapshot, LiftSet } from "./data.ts";
import type { ClientResult } from "../profile/browser.ts";
import { isDay } from "../../shared/validation.ts";

export type TrainingEffect = Readonly<{ id: number }> & (
  | Readonly<{ kind: "load"; date: string }>
  | Readonly<{ kind: "confirmReload"; date: string }>
  | Readonly<{ kind: "save"; revision: number; workout: Workout; generation: number; finish: boolean }>
);
export type TrainingModel = Readonly<{
  snapshot: TrainingSnapshot | undefined; workout: Workout | undefined; selected: string | undefined;
  tab: "log" | "history" | "instructions"; drafts: Readonly<Record<string, string>>;
  generation: number; saved: number; sequence: number; pending: TrainingEffect | undefined;
  compact: boolean; error: string; failedLoadDate: string | undefined; finishRequested: boolean; clock: number;
}>;
export type TrainingProposal =
  | Readonly<{ kind: "started" | "retry" | "reload" | "finish" | "restSkipped" }>
  | Readonly<{ kind: "dateSelected"; date: string }>
  | Readonly<{ kind: "clockTicked"; now: number }>
  | Readonly<{ kind: "viewportChanged"; compact: boolean }>
  | Readonly<{ kind: "exerciseSelected"; id: string }>
  | Readonly<{ kind: "tabSelected"; tab: "log" | "history" | "instructions" }>
  | Readonly<{ kind: "setChanged"; id: string; slot: number; field: "kg" | "reps"; value: string }>
  | Readonly<{ kind: "setCommitted"; id: string; slot: number; field: "kg" | "reps" }>
  | Readonly<{ kind: "setToggled"; id: string; slot: number }>
  | Readonly<{ kind: "swapToggled"; id: string }>
  | Readonly<{ kind: "noteChanged"; id: string; value: string }>
  | Readonly<{ kind: "cardioChanged"; id: string; value: string }>
  | Readonly<{ kind: "mobilityToggled"; id: string; index: number }>
  | Readonly<{ kind: "restStarted"; seconds: number }>
  | Readonly<{ kind: "restExtended"; seconds: number }>
  | Readonly<{ kind: "loaded" | "saved"; id: number; result: ClientResult<TrainingSnapshot> }>
  | Readonly<{ kind: "failed"; id: number }>
  | Readonly<{ kind: "reloadConfirmed"; id: number; discard: boolean }>;

export function initialTrainingModel(input: Readonly<{ now: number; compact?: boolean }>): TrainingModel {
  return { compact: input.compact ?? false, snapshot: undefined, workout: undefined, selected: undefined, tab: "log", drafts: {}, generation: 0, saved: 0, sequence: 0, pending: undefined, error: "", failedLoadDate: undefined, finishRequested: false, clock: input.now };
}
function load(model: TrainingModel, date = ""): TrainingModel {
  const id = model.sequence + 1;
  return { ...model, sequence: id, pending: { id, kind: "load", date }, error: "", failedLoadDate: undefined };
}
function sync(model: TrainingModel): TrainingModel {
  if (!model.workout || !model.snapshot || model.pending || model.error || (model.generation <= model.saved && !model.finishRequested)) return model;
  const id = model.sequence + 1;
  return { ...model, sequence: id, pending: { id, kind: "save", revision: model.snapshot.revision, workout: model.workout, generation: model.generation, finish: model.finishRequested } };
}
function withRow(workout: Workout, id: string, slot: number, row: LiftSet): Workout {
  const rows = Array.from({ length: Math.max(slot + 1, workout.sets[id]?.length ?? 0) }, (_, i) => i === slot ? row : workout.sets[id]?.[i] ?? { kg: 0, reps: 0, done: false });
  return { ...workout, sets: { ...workout.sets, [id]: rows } };
}
function change(model: TrainingModel, workout: Workout): TrainingModel { return sync({ ...model, workout, generation: model.generation + 1, error: "", failedLoadDate: undefined }); }

export function acceptTrainingProposal(model: TrainingModel, proposal: TrainingProposal): TrainingModel {
  switch (proposal.kind) {
    case "started": return model.sequence ? model : load(model);
    case "retry": return model.pending ? model : model.failedLoadDate !== undefined ? load(model, model.failedLoadDate) : model.snapshot ? sync({ ...model, error: "" }) : load(model);
    case "reload": return model.pending ? model : hasUnsavedTraining(model) ? { ...model, sequence: model.sequence + 1, pending: { id: model.sequence + 1, kind: "confirmReload", date: model.workout?.date ?? "" } } : load(model, model.workout?.date);
    case "reloadConfirmed": return model.pending?.kind !== "confirmReload" || model.pending.id !== proposal.id ? model : proposal.discard ? load(model, model.pending.date) : { ...model, pending: undefined };
    case "dateSelected": return !model.pending && !hasUnsavedTraining(model) && isDay(proposal.date) ? load(model, proposal.date) : { ...model, error: "Save or correct your workout edits before changing days. Reload the saved workout to discard them." };
    case "viewportChanged": return { ...model, compact: proposal.compact };
    case "clockTicked": return { ...model, clock: proposal.now };
    case "exerciseSelected": return { ...model, selected: proposal.id, tab: "log" };
    case "tabSelected": return { ...model, tab: proposal.tab };
    case "failed": return model.pending?.id === proposal.id ? { ...model, pending: undefined,
      failedLoadDate: model.pending.kind === "load" ? model.pending.date : undefined,
      error: model.pending.kind === "load" ? "Workout could not be loaded. Try again." : "Workout could not be saved. Try again." } : model;
    case "loaded": {
      if (model.pending?.kind !== "load" || model.pending.id !== proposal.id) return model;
      if (!proposal.result.ok) return { ...model, pending: undefined, failedLoadDate: model.pending.date, error: proposal.result.error.message };
      return { ...model, failedLoadDate: undefined, snapshot: proposal.result.value, workout: proposal.result.value.workout, pending: undefined, generation: 0, saved: 0, finishRequested: false, drafts: {}, error: "", selected: PROGRAM[proposal.result.value.workout.planKey]?.[0]?.id };
    }
    case "saved": {
      if (model.pending?.kind !== "save" || model.pending.id !== proposal.id) return model;
      if (!proposal.result.ok) return { ...model, pending: undefined, error: proposal.result.error.message };
      const saved = proposal.result.value;
      return sync({ ...model, snapshot: saved, workout: model.pending.generation === model.generation ? saved.workout
        : model.workout ? { ...model.workout, startedAt: saved.workout.startedAt, finishedAt: saved.workout.finishedAt } : saved.workout,
        pending: undefined, saved: model.pending.generation, finishRequested: model.pending.finish ? false : model.finishRequested, error: "" });
    }
  }
  const workout = model.workout;
  if (!workout || !model.snapshot || model.snapshot.blocked || model.snapshot.readOnly || model.pending?.kind === "load") return model;
  const exercises = exercisesFor(workout);
  switch (proposal.kind) {
    case "setChanged": return { ...model, drafts: { ...model.drafts, [`${proposal.id}:${proposal.slot}:${proposal.field}`]: proposal.value }, error: "" };
    case "setCommitted": {
      const exercise = exercises.find(e => e.id === proposal.id);
      if (!exercise?.sets || proposal.slot < 0 || proposal.slot >= exercise.sets) return model;
      const raw = model.drafts[`${proposal.id}:${proposal.slot}:${proposal.field}`] ?? "", value = raw.trim() ? Number(raw.replace(",", ".")) : 0;
      if (setNumberProblem({ field: proposal.field, value, done: workout.sets[proposal.id]?.[proposal.slot]?.done ?? false })) return model;
      const row = workout.sets[proposal.id]?.[proposal.slot] ?? { kg: 0, reps: 0, done: false };
      return row[proposal.field] === value ? model : change(model, withRow(workout, proposal.id, proposal.slot, { ...row, [proposal.field]: value }));
    }
    case "setToggled": {
      const exercise = exercises.find(e => e.id === proposal.id);
      if (!exercise?.sets || proposal.slot < 0 || proposal.slot >= exercise.sets) return model;
      const previous = model.snapshot.history.filter(w => w.date !== workout.date && w.finishedAt).find(w => w.sets[proposal.id]?.[proposal.slot]?.done)?.sets[proposal.id]?.[proposal.slot];
      const current = workout.sets[proposal.id]?.[proposal.slot] ?? { kg: 0, reps: 0, done: false };
      const kgDraft = model.drafts[`${proposal.id}:${proposal.slot}:kg`], repsDraft = model.drafts[`${proposal.id}:${proposal.slot}:reps`];
      const kg = kgDraft?.trim() ? Number(kgDraft.replace(",", ".")) : current.kg || previous?.kg || 0;
      const reps = repsDraft?.trim() ? Number(repsDraft) : current.reps || previous?.reps || parseInt(exercise.reps ?? "1", 10);
      if (setNumberProblem({ field: "kg", value: kg, done: true }) || setNumberProblem({ field: "reps", value: reps, done: true })) return { ...model, error: "Check the weight and reps before completing the set." };
      return change(model, { ...withRow(workout, proposal.id, proposal.slot, { kg, reps, done: !current.done }),
        restUntil: !current.done && exercise.rest ? model.clock + exercise.rest * 1000 : workout.restUntil });
    }
    case "swapToggled": return change(model, { ...workout, swaps: { ...workout.swaps, [proposal.id]: !workout.swaps[proposal.id] } });
    case "noteChanged": return proposal.value.length <= 2000 ? change(model, { ...workout, notes: { ...workout.notes, [proposal.id]: proposal.value } }) : model;
    case "cardioChanged": {
      const minutes = Number(proposal.value);
      return Number.isFinite(minutes) && minutes >= 0 && minutes <= 600 ? change(model, { ...workout, cardio: { ...workout.cardio, [proposal.id]: minutes } }) : { ...model, error: "Enter cardio minutes between 0 and 600." };
    }
    case "mobilityToggled": {
      const exercise = exercises.find(e => e.id === proposal.id);
      return exercise?.checklist ? change(model, { ...workout, mobility: { ...workout.mobility, [proposal.id]: exercise.checklist.map((_, i) => i === proposal.index ? !workout.mobility[proposal.id]?.[i] : workout.mobility[proposal.id]?.[i] ?? false) } }) : model;
    }
    case "restStarted": return proposal.seconds > 0 && proposal.seconds <= 3600 ? change(model, { ...workout, restUntil: model.clock + proposal.seconds * 1000 }) : model;
    case "restExtended": return workout.restUntil ? change(model, { ...workout, restUntil: workout.restUntil + proposal.seconds * 1000 }) : model;
    case "restSkipped": return change(model, { ...workout, restUntil: null });
    case "finish": return hasUnsavedSetDrafts(model) ? { ...model, error: "Correct or save your set entries before finishing your workout." } : workoutStats({ workout, history: model.snapshot.history }).hasActivity ? sync({ ...model, finishRequested: true, error: "" }) : { ...model, error: "Log at least one set or recovery activity before finishing." };
  }
}

function hasUnsavedSetDrafts(model: TrainingModel): boolean {
  return Object.entries(model.drafts).some(([key, raw]) => {
    const [id, slot, field] = key.split(":");
    if (field !== "kg" && field !== "reps") return false;
    const value = raw.trim() ? Number(raw.replace(",", ".")) : 0;
    return !Number.isFinite(value) || value !== (model.workout?.sets[id ?? ""]?.[Number(slot)]?.[field] ?? 0);
  });
}
export function hasUnsavedTraining(model: TrainingModel): boolean {
  return model.generation > model.saved || model.finishRequested || hasUnsavedSetDrafts(model);
}

export function representTraining(model: TrainingModel) {
  const workout = model.workout;
  const fieldErrors = Object.fromEntries(Object.entries(model.drafts).flatMap(([key, raw]) => {
    const [id, slot, field] = key.split(":");
    if (field !== "kg" && field !== "reps") return [];
    const error = setNumberProblem({ field, value: raw.trim() ? Number(raw.replace(",", ".")) : 0, done: workout?.sets[id ?? ""]?.[Number(slot)]?.done ?? false });
    return error ? [[key, error]] : [];
  }));
  return { ...model, fieldErrors, exercises: workout ? exercisesFor(workout) : [], stats: workout ? workoutStats({ workout, history: model.snapshot?.history ?? [] }) : { sets: 0, volume: 0, records: [], hasActivity: false },
    elapsed: workout?.startedAt ? Math.max(0, Math.floor(((workout.finishedAt ?? model.clock) - workout.startedAt) / 1000)) : 0,
    remaining: workout?.restUntil ? Math.max(0, Math.ceil((workout.restUntil - model.clock) / 1000)) : 0,
    unsaved: hasUnsavedTraining(model), saving: model.pending?.kind === "save", loading: model.pending?.kind === "load" } as const;
}
export type TrainingState = ReturnType<typeof representTraining>;
