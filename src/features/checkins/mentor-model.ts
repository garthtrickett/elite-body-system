import type { ClientResult } from "../../shared/client-result.ts";
import type { NavigationGuard } from "../../shared/browser-route.ts";
import { mentorKey } from "./mentor-data.ts";
import type { MentorQueue, MentorHistory, MentorSummary } from "./mentor-data.ts";

type Target = Readonly<{ clientId: string; week: string }>;
type Task = Readonly<{ kind: "load" }> | (Target & Readonly<{ kind: "summary" }>) | (Target & Readonly<{ kind: "review"; revision: number; clientName: string }>) | Readonly<{ kind: "history"; clientId: string; before?: string }>;
export type MentorEffect = Task & Readonly<{ id: number }>;
export type MentorModel = Readonly<{ queue?: MentorQueue | undefined; open: string | null; summaryOpen: string | null; historyClient: string | null; history?: MentorHistory | undefined; error: string; status: string; uncertain: boolean; pending?: MentorEffect | undefined; retry?: Task | undefined; nextId: number }>;
export type MentorProposal = Readonly<{ kind: "started" | "refresh" | "retry" | "closeHistory" | "olderHistory" }>
  | (Target & Readonly<{ kind: "expand" | "summary" | "review" }>)
  | Readonly<{ kind: "history"; clientId: string }>
  | Readonly<{ kind: "queueLoaded"; id: number; result: ClientResult<MentorQueue> }>
  | Readonly<{ kind: "summaryLoaded"; id: number; result: ClientResult<MentorSummary> }>
  | Readonly<{ kind: "historyLoaded"; id: number; result: ClientResult<MentorHistory> }>
  | Readonly<{ kind: "reviewed"; id: number; result: ClientResult<Readonly<{ reviewed: true }>> }>;
export const initialMentorModel = (): MentorModel => ({ open: null, summaryOpen: null, historyClient: null, error: "", status: "", uncertain: false, nextId: 1 });
const queue = (model: MentorModel, task: Task): MentorModel => ({ ...model, pending: { ...task, id: model.nextId }, nextId: model.nextId + 1, error: "", retry: undefined });
export function mentorNavigation(model: MentorModel): NavigationGuard { return model.pending?.kind === "review" || model.uncertain ? { kind: "blocked", message: "Finish saving the check-in review or retry before leaving." } : { kind: "ready" }; }
export function acceptMentor(model: MentorModel, proposal: MentorProposal): MentorModel {
  if (proposal.kind === "expand") return model.queue?.items.some(item => mentorKey({ clientId: item.clientId, week: item.entry.week }) === mentorKey(proposal)) ? { ...model, open: model.open === mentorKey(proposal) ? null : mentorKey(proposal) } : model;
  if (proposal.kind === "closeHistory") return { ...model, historyClient: null, history: undefined };
  if (proposal.kind === "queueLoaded" || proposal.kind === "summaryLoaded" || proposal.kind === "historyLoaded" || proposal.kind === "reviewed") {
    const task = model.pending;
    const expected = proposal.kind === "queueLoaded" ? "load" : proposal.kind === "summaryLoaded" ? "summary" : proposal.kind === "historyLoaded" ? "history" : "review";
    if (!task || task.id !== proposal.id || task.kind !== expected) return model;
    if (!proposal.result.ok) return { ...model, pending: undefined, error: proposal.result.error.message, retry: task, uncertain: task.kind === "review" && proposal.result.error.code === "unavailable" };
    const updated: MentorModel = { ...model, pending: undefined, error: "", retry: undefined, uncertain: false };
    if (proposal.kind === "queueLoaded") {
      const items = proposal.result.value.items;
      return { ...updated, queue: proposal.result.value, open: model.queue && model.open === null ? null : items.some(item => mentorKey({ clientId: item.clientId, week: item.entry.week }) === model.open) ? model.open : items[0] ? mentorKey({ clientId: items[0].clientId, week: items[0].entry.week }) : null };
    }
    if (proposal.kind === "summaryLoaded" && task.kind === "summary" && model.queue) {
      const summary = proposal.result.value;
      return { ...updated, queue: { ...model.queue, items: model.queue.items.map(item => item.clientId === task.clientId && item.entry.week === task.week ? { ...item, summary } : item) } };
    }
    if (proposal.kind === "historyLoaded" && task.kind === "history") return model.historyClient !== task.clientId ? updated : { ...updated, history: task.before && model.history ? { ...proposal.result.value, entries: [...model.history.entries, ...proposal.result.value.entries] } : proposal.result.value };
    if (proposal.kind === "reviewed" && task.kind === "review" && model.queue) {
      const items = model.queue.items.filter(item => item.clientId !== task.clientId || item.entry.week !== task.week);
      return queue({ ...updated, queue: { ...model.queue, items, total: Math.max(0, model.queue.total - 1) }, open: items[0] ? mentorKey({ clientId: items[0].clientId, week: items[0].entry.week }) : null, summaryOpen: null, historyClient: null, history: undefined, status: `✓ ${task.clientName}’s check-in reviewed.` }, { kind: "load" });
    }
    return updated;
  }
  if (model.pending || model.uncertain && proposal.kind !== "retry") return model;
  if (proposal.kind === "retry") return model.retry ? queue(model, model.retry) : model;
  if (proposal.kind === "started" || proposal.kind === "refresh") return proposal.kind === "started" && model.queue ? model : queue(model, { kind: "load" });
  if (proposal.kind === "history") return model.queue?.items.some(item => item.clientId === proposal.clientId) ? queue({ ...model, historyClient: proposal.clientId, history: undefined }, { kind: "history", clientId: proposal.clientId }) : model;
  if (proposal.kind === "olderHistory") return model.historyClient && model.history?.nextCursor ? queue(model, { kind: "history", clientId: model.historyClient, before: model.history.nextCursor }) : model;
  if (proposal.kind === "summary" || proposal.kind === "review") {
    const item = model.queue?.items.find(item => item.clientId === proposal.clientId && item.entry.week === proposal.week);
    if (!item) return model;
    if (proposal.kind === "review") return queue(model, { kind: "review", clientId: item.clientId, week: item.entry.week, revision: item.entry.revision, clientName: item.clientName });
    const key = mentorKey(proposal);
    if (model.summaryOpen === key) return { ...model, summaryOpen: null };
    return item.summary ? { ...model, summaryOpen: key } : queue({ ...model, summaryOpen: key }, { kind: "summary", clientId: item.clientId, week: item.entry.week });
  }
  return model;
}
