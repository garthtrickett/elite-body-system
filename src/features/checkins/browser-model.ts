import { blankAnswers, incompleteSections, parseAnswers, withMeasurements, PROGRESSIVE_OVERLOAD, QUESTIONS } from "./data.ts";
import type { Answers, Snapshot, History, Entry, MeasurementDraft, Measure, Score, PriorityMovement, ProgressiveOverload } from "./data.ts";
import type { ClientResult } from "../../shared/client-result.ts";
import type { NavigationGuard } from "../../shared/browser-route.ts";

type Task = Readonly<{ kind: "load" | "navigate" | "focusProgress" }> | Readonly<{ kind: "save"; week: string; revision: number; answers: Answers; rawMeasurements: MeasurementDraft; submit: boolean; generation: number }> | Readonly<{ kind: "history"; before: string }> | Readonly<{ kind: "confirmReload" }>;
export type CheckinEffect = Task & Readonly<{ id: number }>;
export type CheckinModel = Readonly<{ snapshot?: Snapshot | undefined; draft: Answers; raw: MeasurementDraft; generation: number; dirty: boolean; uncertain: boolean; showIncomplete: boolean; submitRequested: boolean; error: string; status: string; pending?: CheckinEffect | undefined; retry?: Task | undefined; nextId: number; reloadRequired: boolean; compareWeek: string; previewingProgress: boolean }>;
export type CheckinProposal = Readonly<{ kind: "started" | "refresh" | "submit" | "retry" | "reload" | "more" | "continue" | "editPreview" }>
  | Readonly<{ kind: "compare"; week: string }>
  | Readonly<{ kind: "progressShown"; id: number }>
  | Readonly<{ kind: "autosave"; generation: number }>
  | Readonly<{ kind: "text"; field: "wins" | "lesson" | "reflection" | "answer"; value: string }>
  | Readonly<{ kind: "score"; field: Score; value: number }>
  | Readonly<{ kind: "measure"; field: Measure; value: string }>
  | Readonly<{ kind: "priorityMovement"; value: PriorityMovement }>
  | Readonly<{ kind: "progressiveOverload"; value: ProgressiveOverload }>
  | Readonly<{ kind: "completed"; id: number; effectKind: "load" | "save"; result: ClientResult<Snapshot> }>
  | Readonly<{ kind: "historyLoaded"; id: number; result: ClientResult<History> }>
  | Readonly<{ kind: "reloadConfirmed"; id: number; accepted: boolean }>
  | Readonly<{ kind: "navigated"; id: number }>;
export function initialCheckinModel(): CheckinModel { return { draft: blankAnswers("2026-01-03"), raw: { weight: "", waist: "", muscle: "" }, generation: 0, dirty: false, uncertain: false, showIncomplete: false, submitRequested: false, error: "", status: "", nextId: 1, reloadRequired: false, compareWeek: "", previewingProgress: false }; }
const queue = (model: CheckinModel, task: Task): CheckinModel => ({ ...model, error: "", retry: undefined, pending: { ...task, id: model.nextId }, nextId: model.nextId + 1 });
const editable = (model: CheckinModel) => !!model.snapshot?.enabled && model.snapshot.enrolled && !model.snapshot.current?.submittedAt && (!model.pending || model.pending.kind === "save" && !model.pending.submit) && !model.submitRequested && !model.uncertain && !model.reloadRequired;
const changed = (model: CheckinModel): CheckinModel => ({ ...model, generation: model.generation + 1, dirty: true, status: "", error: "", retry: undefined });
function save(model: CheckinModel, submit: boolean): CheckinModel {
  if (!model.snapshot) return model;
  const parsed = parseAnswers(withMeasurements({ answers: model.draft, rawMeasurements: model.raw }));
  if (!parsed.ok) return { ...model, submitRequested: false, error: parsed.error.message };
  return queue(model, { kind: "save", week: model.snapshot.week, revision: model.snapshot.current?.revision ?? 0, answers: parsed.value, rawMeasurements: model.raw, submit, generation: model.generation });
}
export function checkinNavigation(model: CheckinModel): NavigationGuard {
  return model.pending?.kind === "save" || model.uncertain ? { kind: "blocked", message: "Finish saving or retry your check-in before leaving." }
    : model.dirty ? { kind: "confirm", message: "Your latest answers are still being saved. Leave this page?" } : { kind: "ready" };
}
export function acceptCheckinProposal(model: CheckinModel, proposal: CheckinProposal): CheckinModel {
  if (proposal.kind === "progressShown") return model.pending?.kind === "focusProgress" && model.pending.id === proposal.id ? { ...model, pending: undefined } : model;
  if (proposal.kind === "editPreview") return !model.pending && model.snapshot?.flowPreview ? { ...model, previewingProgress: false, submitRequested: false } : model;
  if (proposal.kind === "continue") return !model.pending && model.snapshot && (model.snapshot.current?.submittedAt || model.previewingProgress && model.snapshot.flowPreview) && !model.snapshot.required ? queue(model, { kind: "navigate" }) : model;
  if (proposal.kind === "compare") return proposal.week === "" || model.snapshot?.history.some(entry => entry.week === proposal.week && entry.week !== model.snapshot?.current?.week) ? { ...model, compareWeek: proposal.week } : model;
  if (proposal.kind === "navigated") return model.pending?.kind === "navigate" && model.pending.id === proposal.id ? { ...model, pending: undefined } : model;
  if (proposal.kind === "started") return !model.snapshot && !model.pending ? queue(model, { kind: "load" }) : model;
  if (proposal.kind === "refresh") return !model.pending && !model.dirty && !model.uncertain && !model.reloadRequired ? queue(model, { kind: "load" }) : model;
  if (proposal.kind === "retry") return !model.pending && model.retry ? queue(model, model.retry) : model;
  if (proposal.kind === "reload") return !model.pending ? { ...queue(model, { kind: "confirmReload" }), retry: model.retry, error: model.error } : model;
  if (proposal.kind === "reloadConfirmed") return model.pending?.kind === "confirmReload" && model.pending.id === proposal.id
    ? proposal.accepted ? queue({ ...model, uncertain: false, dirty: false, submitRequested: false, reloadRequired: false }, { kind: "load" }) : { ...model, pending: undefined } : model;
  if (proposal.kind === "more") return !model.pending && !model.uncertain && !model.reloadRequired && model.snapshot?.nextCursor ? queue(model, { kind: "history", before: model.snapshot.nextCursor }) : model;
  if (proposal.kind === "historyLoaded") {
    if (model.pending?.kind !== "history" || model.pending.id !== proposal.id || !model.snapshot) return model;
    return proposal.result.ok ? { ...model, pending: undefined, snapshot: { ...model.snapshot, history: [...model.snapshot.history, ...proposal.result.value.entries], nextCursor: proposal.result.value.nextCursor } }
      : { ...model, pending: undefined, error: proposal.result.error.message, retry: model.pending };
  }
  if (proposal.kind === "completed") {
    if (model.pending?.id !== proposal.id || model.pending.kind !== proposal.effectKind) return model;
    if (!proposal.result.ok) return { ...model, pending: undefined, submitRequested: false, error: proposal.result.error.message, retry: model.pending, uncertain: proposal.effectKind === "save" && proposal.result.error.code === "unavailable", reloadRequired: proposal.result.error.code === "conflict" };
    const snapshot = proposal.result.value, saving = model.pending.kind === "save", draft = snapshot.current?.answers ?? blankAnswers(snapshot.week);
    const dirty = saving && model.pending.kind === "save" && model.generation !== model.pending.generation;
    const updated: CheckinModel = { ...model, snapshot, draft: saving ? model.draft : draft, raw: saving ? model.raw : snapshot.current?.rawMeasurements ?? { weight: "", waist: "", muscle: "" }, pending: undefined, retry: undefined, dirty, uncertain: false, reloadRequired: false, error: "", status: saving && !dirty ? snapshot.current?.submittedAt ? "Check-in complete." : "Saved automatically." : "" };
    if (model.pending.kind === "save" && model.pending.submit && snapshot.current?.submittedAt && !snapshot.required) return queue({ ...updated, submitRequested: false }, { kind: "focusProgress" });
    if (saving && model.submitRequested && snapshot.flowPreview) return queue({ ...updated, submitRequested: false, previewingProgress: true }, { kind: "focusProgress" });
    return saving && model.submitRequested ? save(updated, true) : updated;
  }
  if (proposal.kind === "autosave") return editable(model) && model.dirty && !model.pending && !model.retry && proposal.generation === model.generation ? save(model, false) : model;
  if (!editable(model)) return model;
  if (proposal.kind === "text") return changed({ ...model, draft: { ...model.draft, [proposal.field]: proposal.value } });
  if (proposal.kind === "score") return Number.isInteger(proposal.value) && proposal.value >= 1 && proposal.value <= 10 ? changed({ ...model, draft: { ...model.draft, scores: { ...model.draft.scores, [proposal.field]: proposal.value } } }) : model;
  if (proposal.kind === "measure") return proposal.value.length <= 50 ? changed({ ...model, raw: { ...model.raw, [proposal.field]: proposal.value } }) : model;
  if (proposal.kind === "priorityMovement") return proposal.value === "unchanged" || proposal.value === "improved" ? changed({ ...model, draft: { ...model.draft, data: { ...model.draft.data, priorityMovement: proposal.value, progressiveOverload: proposal.value === "improved" ? model.draft.data.progressiveOverload : [] } } }) : model;
  if (proposal.kind === "progressiveOverload") {
    if (model.draft.data.priorityMovement !== "improved" || !Object.hasOwn(PROGRESSIVE_OVERLOAD, proposal.value)) return model;
    return changed({ ...model, draft: { ...model.draft, data: { ...model.draft.data, progressiveOverload: [proposal.value] } } });
  }
  if (proposal.kind === "submit") {
    if (model.snapshot?.flowPreview) {
      if (model.pending) return { ...model, submitRequested: true };
      if (model.dirty) return save({ ...model, submitRequested: true }, false);
      return queue({ ...model, previewingProgress: true }, { kind: "focusProgress" });
    }
    const updated = { ...model, showIncomplete: true };
    if (incompleteSections({ answers: model.draft, rawMeasurements: model.raw }).length) return updated;
    if (!model.snapshot?.due) return { ...updated, error: "You can complete this check-in when it opens on Saturday. Your answers save automatically." };
    return model.pending ? { ...updated, submitRequested: true } : save({ ...updated, submitRequested: true }, true);
  }
  return model;
}
export function representCheckin(model: CheckinModel) {
  const snapshot = model.snapshot;
  const previewEntry: Entry | undefined = model.previewingProgress && snapshot?.flowPreview ? {
    week: snapshot.week, revision: snapshot.current?.revision ?? 1,
    answers: withMeasurements({ answers: model.draft, rawMeasurements: model.raw }), rawMeasurements: model.raw,
    question: QUESTIONS[model.draft.qIndex]!, savedAt: snapshot.current?.savedAt ?? "", submittedAt: null,
  } : undefined;
  const progressEntries = previewEntry ? [previewEntry, ...(snapshot?.history ?? []).filter(entry => entry.week !== previewEntry.week)] : snapshot?.history ?? [];
  return { ...model, progressEntries, editable: editable(model), autosaveReady: editable(model) && model.dirty && !model.pending && !model.retry, incomplete: model.showIncomplete ? incompleteSections({ answers: model.draft, rawMeasurements: model.raw }) : [] };
}
