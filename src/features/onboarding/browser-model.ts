import type { ClientResult } from "../../shared/client-result.ts";
import { SECTIONS, emptyAnswers, missingRequirements } from "./data.ts";
import type { OnboardingAnswers, OnboardingSnapshot, Section } from "./data.ts";

type SaveInput = Readonly<{ answers: OnboardingAnswers; revision: number; contentVersion: string }>;
export type OnboardingEffect = Readonly<{ id: number }> & (
  | Readonly<{ kind: "load" }>
  | Readonly<{ kind: "cancelUpload" }>
  | Readonly<{ kind: "refreshBooking" }>
  | Readonly<{ kind: "signOut"; confirm: boolean }>
  | (Readonly<{ kind: "save"; next: Section | null; validate: boolean }> & SaveInput)
  | Readonly<{ kind: "complete"; revision: number }>
  | (Readonly<{ kind: "upload"; selection: number; slot: string }> & SaveInput)
  | Readonly<{ kind: "remove"; mediaId: string }>
  | Readonly<{ kind: "read"; mediaId: string }>
  | Readonly<{ kind: "navigate"; href: string }>);
export type OnboardingModel = Readonly<{
  snapshot: OnboardingSnapshot | null; draft: OnboardingAnswers; section: Section;
  dirty: boolean; sequence: number; pending: OnboardingEffect | undefined;
  error: string; message: string; showMissing: boolean; progress: number; reloadRequired: boolean;
  accountBusy: boolean; accountProblem: string; exiting: boolean;
}>;
export type OnboardingProposal =
  | Readonly<{ kind: "started" | "reload" | "save" | "next" | "complete" }>
  | Readonly<{ kind: "cancelUpload" }>
  | Readonly<{ kind: "refreshBooking" }>
  | Readonly<{ kind: "signOut" }>
  | Readonly<{ kind: "accountChanged"; busy: boolean; problem: string }>
  | Readonly<{ kind: "signOutConfirmed"; id: number; accepted: boolean }>
  | Readonly<{ kind: "edit"; answers: OnboardingAnswers }>
  | Readonly<{ kind: "section"; section: Section }>
  | Readonly<{ kind: "upload"; slot: string; selection: number }>
  | Readonly<{ kind: "remove" | "read"; mediaId: string }>
  | Readonly<{ kind: "progress"; id: number; progress: number }>
  | Readonly<{ kind: "completed"; id: number; effectKind: OnboardingEffect["kind"]; result: ClientResult<OnboardingSnapshot>; saved?: OnboardingSnapshot }>
  | Readonly<{ kind: "fileOpened"; id: number; result: ClientResult<Readonly<{ opened: true }>> }>
  | Readonly<{ kind: "failed"; id: number }>;

export const initialOnboardingModel = (): OnboardingModel => ({ snapshot: null, draft: emptyAnswers(), section: "welcome", dirty: false, sequence: 0, pending: undefined, error: "", message: "", showMissing: false, progress: 0, reloadRequired: false, accountBusy: false, accountProblem: "", exiting: false });
function queue(model: OnboardingModel, effect: OnboardingEffect): OnboardingModel { return { ...model, sequence: effect.id, pending: effect, error: "", message: "", progress: 0 }; }
export function acceptOnboarding(model: OnboardingModel, proposal: OnboardingProposal): OnboardingModel {
  if (proposal.kind === "accountChanged") return { ...model, accountBusy: proposal.busy, accountProblem: proposal.problem, exiting: proposal.problem ? false : model.exiting };
  if (proposal.kind === "signOutConfirmed") return model.pending?.id === proposal.id && model.pending.kind === "signOut" ? { ...model, pending: undefined, exiting: proposal.accepted && !model.accountProblem } : model;
  if (proposal.kind === "cancelUpload") return model.pending?.kind === "upload" ? queue(model, { kind: "cancelUpload", id: model.sequence + 1 }) : model;
  if (proposal.kind === "progress") return model.pending?.id === proposal.id && model.pending.kind === "upload" ? { ...model, progress: Math.max(0, Math.min(100, proposal.progress)) } : model;
  if (proposal.kind === "failed") return model.pending?.id === proposal.id ? { ...model, pending: undefined, error: "Could not complete that action. Reload saved progress before retrying.", reloadRequired: true } : model;
  if (proposal.kind === "fileOpened") {
    if (model.pending?.id !== proposal.id || model.pending.kind !== "read") return model;
    return { ...model, pending: undefined, error: proposal.result.ok ? "" : proposal.result.error.message };
  }
  if (proposal.kind === "completed") {
    const effect = model.pending;
    if (!effect || effect.id !== proposal.id || effect.kind !== proposal.effectKind) return model;
    if (!proposal.result.ok) return { ...model, ...(proposal.saved ? { snapshot: proposal.saved, draft: proposal.saved.answers, dirty: false } : {}), pending: undefined, error: proposal.result.error.message, reloadRequired: proposal.result.error.code === "conflict" || proposal.result.error.code === "unavailable" };
    const snapshot = proposal.result.value;
    const invalid = effect.kind === "save" && effect.validate && snapshot.missing[model.section].length > 0;
    const section = effect.kind === "save" && effect.next && !invalid ? effect.next : model.section;
    const cancelled = effect.kind === "cancelUpload";
    const updated = { ...model, snapshot, draft: cancelled ? model.draft : snapshot.answers, dirty: cancelled && JSON.stringify(model.draft) !== JSON.stringify(snapshot.answers), pending: undefined, section, showMissing: !!invalid, error: "", message: cancelled ? "Upload cancelled. Check your answers and save any remaining changes." : effect.kind === "load" ? "" : "Saved to your account.", reloadRequired: false };
    return effect.kind === "complete" && snapshot.completedAt ? queue(updated, { kind: "navigate", id: model.sequence + 1, href: "/" }) : updated;
  }
  if (model.pending || model.accountBusy) return model;
  const id = model.sequence + 1;
  if (proposal.kind === "signOut") return queue(model, { kind: "signOut", id, confirm: model.dirty });
  if (proposal.kind === "started" || proposal.kind === "reload") return queue(model, { kind: "load", id });
  if (!model.snapshot) return model;
  if (proposal.kind === "refreshBooking") return model.dirty ? { ...model, error: "Save your answers before refreshing your booking." } : queue(model, { kind: "refreshBooking", id });
  if (proposal.kind === "edit") {
    if (model.snapshot.completedAt || model.reloadRequired) return model;
    return { ...model, draft: proposal.answers, dirty: true, message: "" };
  }
  if (proposal.kind === "read" || proposal.kind === "remove") return model.dirty ? { ...model, error: "Save your answers before managing assessment files." } : queue(model, { ...proposal, id });
  if (proposal.kind === "complete") {
    if (model.dirty) return { ...model, error: "Save your answers before finishing onboarding." };
    const firstMissing = SECTIONS.find(section => model.snapshot!.missing[section].length > 0);
    return firstMissing ? { ...model, section: firstMissing, showMissing: true, error: "Complete the remaining requirements before opening your dashboard." } : queue(model, { kind: "complete", id, revision: model.snapshot.revision });
  }
  if (proposal.kind === "section" && (!model.dirty || model.snapshot.completedAt)) return { ...model, section: proposal.section, showMissing: false, error: "", message: "" };
  if (model.reloadRequired) return { ...model, error: "Reload saved progress before editing or saving again." };
  const saved = { answers: model.draft, revision: model.snapshot.revision, contentVersion: model.snapshot.content.version };
  if (proposal.kind === "upload") return queue(model, { kind: "upload", id, ...saved, slot: proposal.slot, selection: proposal.selection });
  if (proposal.kind === "save" || proposal.kind === "next" || proposal.kind === "section") return queue(model, { kind: "save", id, ...saved, validate: proposal.kind === "next", next: proposal.kind === "section" ? proposal.section : proposal.kind === "next" ? SECTIONS[Math.min(SECTIONS.length - 1, SECTIONS.indexOf(model.section) + 1)]! : null });
  return model;
}
export function representOnboarding(model: OnboardingModel) {
  return { ...model, busy: !!model.pending || model.accountBusy, missing: model.snapshot ? missingRequirements({ ...model.snapshot, answers: model.draft }) : null } as const;
}
