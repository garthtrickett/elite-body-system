import type { NavigationGuard } from "../../shared/browser-route.ts";
import type { ClientResult } from "../../shared/client-result.ts";
import { SECTIONS, emptyAnswers, missingRequirements, parseAnswers, healthScreeningProblem, accountSetupProblem } from "./data.ts";
import type { OnboardingAnswers, OnboardingSnapshot, Section } from "./data.ts";
import { emptyMarketingPermission, marketingDraft as savedMarketingDraft, marketingGrantProblem } from "./marketing-data.ts";
import type { MarketingPermission } from "./marketing-data.ts";
import { emptyDocumentAcknowledgements, legalDocument } from "./documents.ts";

type SaveInput = Readonly<{ answers: OnboardingAnswers; revision: number; contentVersion: string }>;
export type OnboardingEffect = Readonly<{ id: number }> & (
  | Readonly<{ kind: "load"; preserveDraft?: boolean }>
  | Readonly<{ kind: "cancelUpload" }>
  | Readonly<{ kind: "refreshBooking" }>
  | Readonly<{ kind: "saveAccountSetup"; revision: number; contentVersion: string; name: string; timezone: string }>
  | Readonly<{ kind: "signOut"; confirm: boolean }>
  | (Readonly<{ kind: "save"; next: Section | null; mode: "background" | "explicit" }> & SaveInput)
  | Readonly<{ kind: "complete"; revision: number }>
  | Readonly<{ kind: "saveMarketing"; revision: number; permission: MarketingPermission }>
  | (Readonly<{ kind: "upload"; selection: number; slot: string }> & SaveInput)
  | Readonly<{ kind: "remove"; mediaId: string }>
  | Readonly<{ kind: "read"; mediaId: string }>
  | Readonly<{ kind: "navigate"; href: string }>);
export type OnboardingModel = Readonly<{
  mode: "onboarding" | "account-setup" | "media";
  snapshot: OnboardingSnapshot | null; draft: OnboardingAnswers; section: Section;
  dirty: boolean; recoveryAnswers: OnboardingAnswers | null; sequence: number; pending: OnboardingEffect | undefined;
  error: string; message: string; showMissing: boolean; progress: number; finalizing: boolean; reloadRequired: boolean;
  accountBusy: boolean; accountProblem: string; exiting: boolean;
  marketingDraft: MarketingPermission; marketingDirty: boolean;
}>;
export type OnboardingProposal =
  | Readonly<{ kind: "navigationHandled"; id: number }>
  | Readonly<{ kind: "started" | "reload" | "save" | "autosave" | "next" | "complete" | "startOnboarding" }>
  | Readonly<{ kind: "cancelUpload" }>
  | Readonly<{ kind: "refreshBooking" }>
  | Readonly<{ kind: "saveMarketing" | "withdrawMarketing" | "discardMarketing" }>
  | Readonly<{ kind: "editMarketing"; permission: MarketingPermission }>
  | Readonly<{ kind: "signOut" }>
  | Readonly<{ kind: "accountChanged"; busy: boolean; problem: string }>
  | Readonly<{ kind: "signOutConfirmed"; id: number; accepted: boolean }>
  | Readonly<{ kind: "edit"; answers: OnboardingAnswers }>
  | Readonly<{ kind: "section"; section: Section }>
  | Readonly<{ kind: "upload"; slot: string; selection: number }>
  | Readonly<{ kind: "remove" | "read"; mediaId: string }>
  | Readonly<{ kind: "progress"; id: number; progress: number }>
  | Readonly<{ kind: "uploadFinalizing"; id: number }>
  | Readonly<{ kind: "completed"; id: number; effectKind: OnboardingEffect["kind"]; result: ClientResult<OnboardingSnapshot>; saved?: OnboardingSnapshot }>
  | Readonly<{ kind: "fileOpened"; id: number; result: ClientResult<Readonly<{ opened: true }>> }>
  | Readonly<{ kind: "failed"; id: number }>;

export const initialOnboardingModel = (): OnboardingModel => ({ mode: "onboarding", snapshot: null, draft: emptyAnswers(), section: "welcome", dirty: false, recoveryAnswers: null, sequence: 0, pending: undefined, error: "", message: "", showMissing: false, progress: 0, finalizing: false, reloadRequired: false, accountBusy: false, accountProblem: "", exiting: false, marketingDraft: emptyMarketingPermission(), marketingDirty: false });
function queue(model: OnboardingModel, effect: OnboardingEffect): OnboardingModel { return { ...model, sequence: effect.id, pending: effect, error: "", message: "", progress: 0, finalizing: false }; }
function saveDraft(model: OnboardingModel, input: Readonly<{ next: Section | null; mode: "background" | "explicit" }>): OnboardingModel {
  if (!model.snapshot) return model;
  return queue(model, { kind: "save", id: model.sequence + 1, ...input, answers: model.draft, revision: model.snapshot.revision, contentVersion: model.snapshot.content.version });
}
function answersDiffer(draft: OnboardingAnswers, saved: OnboardingAnswers): boolean {
  const parsed = parseAnswers(draft), stored = parseAnswers(saved);
  return !parsed.ok || !stored.ok || JSON.stringify(parsed.value) !== JSON.stringify(stored.value);
}
function followingSection(section: Section): Section { return SECTIONS[Math.min(SECTIONS.length - 1, SECTIONS.indexOf(section) + 1)]!; }
function reconcileDraft(input: Readonly<{ base: OnboardingSnapshot; draft: OnboardingAnswers; saved: OnboardingSnapshot; attempted?: OnboardingAnswers | null }>): OnboardingAnswers {
  const { base, draft, saved } = input;
  const retain = <T>(before: T, edited: T, current: T, attempted?: T): T => JSON.stringify(before) === JSON.stringify(edited) && (attempted === undefined || JSON.stringify(attempted) === JSON.stringify(edited)) ? current : edited;
  const fields = <T extends object>(before: T, edited: T, current: T, attempted?: T): T => Object.fromEntries((Object.keys(current) as (keyof T)[]).map(key => [key, retain(before[key], edited[key], current[key], attempted?.[key])])) as T;
  const attempted = input.attempted;
  const merged = fields(base.answers, draft, saved.answers, attempted ?? undefined);
  const changedContent = base.content.version !== saved.content.version;
  const changedScreening = base.content.parqVersion !== saved.content.parqVersion || JSON.stringify(base.content.healthQuestions) !== JSON.stringify(saved.content.healthQuestions);
  const changedRanking = JSON.stringify([base.answers.goals, base.answers.goalsConfirmed]) !== JSON.stringify([draft.goals, draft.goalsConfirmed]) || !!attempted && JSON.stringify([attempted.goals, attempted.goalsConfirmed]) !== JSON.stringify([draft.goals, draft.goalsConfirmed]);
  const health = changedScreening ? saved.answers.health : saved.answers.health.map((answer, index) => retain(base.answers.health[index], draft.health[index], answer, attempted?.health[index]) ?? null);
  const screening = (answers: OnboardingAnswers) => JSON.stringify([answers.health, answers.healthDetails, answers.medicalClearance]);
  const localDeclaration = screening(base.answers) !== screening(draft) || !!attempted && screening(attempted) !== screening(draft);
  const declaration = localDeclaration ? draft : saved.answers;
  return { ...merged,
    ...((draft.documents || saved.answers.documents) ? { documents: Object.fromEntries((["parq", "informed", "coaching"] as const).map(kind => {
      const defaults = emptyDocumentAcknowledgements();
      const signature = fields(base.answers.documents?.[kind] ?? defaults[kind], draft.documents?.[kind] ?? defaults[kind], saved.answers.documents?.[kind] ?? defaults[kind], attempted?.documents?.[kind]);
      return [kind, changedContent ? { ...signature, accepted: false, version: legalDocument(saved.content, kind).version } : signature];
    })) as NonNullable<OnboardingAnswers["documents"]> } : {}),
    goals: changedRanking ? draft.goals : saved.answers.goals,
    goalsConfirmed: changedRanking ? draft.goalsConfirmed : saved.answers.goalsConfirmed,
    acknowledged: changedContent ? saved.answers.acknowledged : fields(base.answers.acknowledged, draft.acknowledged, saved.answers.acknowledged, attempted?.acknowledged),
    consent: changedContent ? { ...fields(base.answers.consent, draft.consent, saved.answers.consent, attempted?.consent), accepted: false, version: saved.answers.consent.version } : fields(base.answers.consent, draft.consent, saved.answers.consent, attempted?.consent),
    questionnaire: fields(base.answers.questionnaire, draft.questionnaire, saved.answers.questionnaire, attempted?.questionnaire),
    measurements: fields(base.answers.measurements, draft.measurements, saved.answers.measurements, attempted?.measurements),
    lifestyle: fields(base.answers.lifestyle, draft.lifestyle, saved.answers.lifestyle, attempted?.lifestyle),
    routine: fields(base.answers.routine, draft.routine, saved.answers.routine, attempted?.routine),
    health,
    medicalClearance: !changedScreening && declaration.medicalClearance && JSON.stringify([health, merged.healthDetails]) === JSON.stringify([declaration.health, declaration.healthDetails]),
  };
}
export function acceptOnboarding(model: OnboardingModel, proposal: OnboardingProposal): OnboardingModel {
  if (proposal.kind === "navigationHandled") return model.pending?.kind === "navigate" && model.pending.id === proposal.id ? { ...model, pending: undefined } : model;
  if (proposal.kind === "accountChanged") return { ...model, accountBusy: proposal.busy, accountProblem: proposal.problem, exiting: proposal.problem ? false : model.exiting };
  if (proposal.kind === "signOutConfirmed") return model.pending?.id === proposal.id && model.pending.kind === "signOut" ? { ...model, pending: undefined, exiting: proposal.accepted && !model.accountProblem } : model;
  if (proposal.kind === "uploadFinalizing") return model.pending?.id === proposal.id && model.pending.kind === "upload" ? { ...model, finalizing: true } : model;
  if (proposal.kind === "cancelUpload") return model.pending?.kind === "upload" && !model.finalizing ? queue(model, { kind: "cancelUpload", id: model.sequence + 1 }) : model;
  if (proposal.kind === "progress") return model.pending?.id === proposal.id && model.pending.kind === "upload" ? { ...model, progress: Math.max(0, Math.min(100, proposal.progress)) } : model;
  if (proposal.kind === "failed") return model.pending?.id === proposal.id ? { ...model, ...(model.pending.kind === "save" ? { dirty: true, recoveryAnswers: model.pending.answers } : {}), pending: undefined, error: "Could not complete that action. Reload saved progress before retrying.", reloadRequired: true } : model;
  if (proposal.kind === "fileOpened") {
    if (model.pending?.id !== proposal.id || model.pending.kind !== "read") return model;
    return { ...model, pending: undefined, error: proposal.result.ok ? "" : proposal.result.error.message };
  }
  if (proposal.kind === "completed") {
    const effect = model.pending;
    if (!effect || effect.id !== proposal.id || effect.kind !== proposal.effectKind) return model;
    if (!proposal.result.ok) return { ...model, ...(effect.kind === "save" ? { dirty: true, recoveryAnswers: effect.answers } : {}), ...(proposal.saved ? { snapshot: proposal.saved, draft: proposal.saved.answers, dirty: false } : {}), pending: undefined, error: proposal.result.error.message, reloadRequired: proposal.result.error.code === "conflict" || proposal.result.error.code === "unavailable" };
    const snapshot = proposal.result.value;
    if (effect.kind === "saveAccountSetup") return queue({ ...model, snapshot, draft: snapshot.answers, dirty: false, recoveryAnswers: null, reloadRequired: false }, { kind: "navigate", id: model.sequence + 1, href: "/onboarding" });
    const saving = effect.kind === "save";
    const section = saving && effect.next ? effect.next : model.section;
    const cancelled = effect.kind === "cancelUpload";
    const retained = saving || effect.kind === "saveMarketing" || cancelled || effect.kind === "load" && effect.preserveDraft;
    const base = saving && model.snapshot ? { ...model.snapshot, answers: effect.answers } : model.snapshot;
    const reconciled = retained && base ? reconcileDraft({ base, draft: model.draft, saved: snapshot, attempted: saving ? null : model.recoveryAnswers }) : snapshot.answers;
    const draft = saving && effect.mode === "background" ? { ...reconciled, questionnaire: model.draft.questionnaire } : reconciled;
    const dirty = !!retained && answersDiffer(draft, snapshot.answers);
    const screeningProblem = !snapshot.completedAt && draft.health.some(Boolean) && SECTIONS.indexOf(section) > SECTIONS.indexOf("audit") ? healthScreeningProblem({ answers: draft }) : null;
    const storedMarketing = savedMarketingDraft(snapshot.marketing);
    const keepMarketing = effect.kind !== "saveMarketing" && model.marketingDirty;
    const changedRelease = model.snapshot?.marketing.release.version !== snapshot.marketing.release.version;
    const changedStory = model.snapshot?.marketing.story?.id !== snapshot.marketing.story?.id;
    const marketingDraft = keepMarketing && !changedStory ? { ...model.marketingDraft, ...(changedRelease ? { version: snapshot.marketing.release.version, accepted: false } : {}) } : storedMarketing;
    const marketingDirty = keepMarketing && JSON.stringify(marketingDraft) !== JSON.stringify(storedMarketing);
    const updated = { ...model, snapshot, draft, dirty, marketingDraft, marketingDirty, recoveryAnswers: null, pending: undefined, section: screeningProblem ? "audit" as const : saving && dirty ? model.section : section, showMissing: !!screeningProblem || saving && !effect.next && model.showMissing, error: screeningProblem || "", message: effect.kind === "saveMarketing" ? snapshot.marketing.record?.action === "granted" ? "Your optional marketing permission is saved." : "No marketing use is permitted. Your choice is saved." : cancelled ? "Upload cancelled. Check your answers and save any remaining changes." : effect.kind === "load" ? dirty || marketingDirty ? "Saved progress reloaded. Your unsaved edits are kept; review them and save to retry." : "" : dirty ? "" : "Saved to your account.", reloadRequired: false };
    if (effect.kind === "load" && model.mode === "onboarding" && !snapshot.completedAt && accountSetupProblem(draft.routine)) return queue(updated, { kind: "navigate", id: model.sequence + 1, href: "/account/setup" });
    if (saving && dirty && effect.mode === "explicit") return saveDraft(updated, { next: effect.next, mode: "explicit" });
    return effect.kind === "complete" && snapshot.completedAt ? queue(updated, { kind: "navigate", id: model.sequence + 1, href: "/" }) : updated;
  }
  if (proposal.kind === "editMarketing") {
    if (!model.snapshot || model.reloadRequired || model.accountBusy || model.pending && !(model.pending.kind === "save" && model.pending.mode === "background")) return model;
    return { ...model, marketingDraft: proposal.permission, marketingDirty: JSON.stringify(proposal.permission) !== JSON.stringify(savedMarketingDraft(model.snapshot.marketing)), error: "", message: "" };
  }
  if (proposal.kind === "edit") {
    if (!model.snapshot || model.snapshot.completedAt || model.reloadRequired || model.accountBusy || model.pending && !(model.pending.kind === "save" && model.pending.mode === "background")) return model;
    const healthChanged = JSON.stringify([model.draft.health, model.draft.healthDetails]) !== JSON.stringify([proposal.answers.health, proposal.answers.healthDetails]);
    const draft = healthChanged ? { ...proposal.answers, medicalClearance: false } : proposal.answers;
    return { ...model, draft, dirty: model.pending?.kind === "save" || answersDiffer(draft, model.snapshot.answers), error: "", message: "" };
  }
  if (model.marketingDirty && (proposal.kind === "section" || proposal.kind === "next" || proposal.kind === "complete")) return { ...model, error: "Save or discard your optional marketing changes before leaving this section. Giving permission is not required." };
  if (!model.accountBusy && model.pending?.kind === "save" && model.pending.mode === "background" && (proposal.kind === "next" || proposal.kind === "section" || proposal.kind === "save")) {
    return { ...model, pending: { ...model.pending, mode: "explicit", next: proposal.kind === "next" ? followingSection(model.section) : proposal.kind === "section" ? proposal.section : null } };
  }
  if (model.pending || model.accountBusy) return model;
  const id = model.sequence + 1;
  if (proposal.kind === "signOut") return queue(model, { kind: "signOut", id, confirm: model.dirty || model.marketingDirty });
  if (proposal.kind === "started" || proposal.kind === "reload") return queue(model, { kind: "load", id, preserveDraft: model.dirty || model.marketingDirty });
  if (!model.snapshot) return model;
  if (proposal.kind === "startOnboarding") {
    if (model.mode !== "account-setup" || model.reloadRequired || model.snapshot.completedAt) return model;
    const problem = accountSetupProblem(model.draft.routine);
    return problem ? { ...model, error: problem } : queue(model, { kind: "saveAccountSetup", id, revision: model.snapshot.revision, contentVersion: model.snapshot.content.version, name: model.draft.routine.name, timezone: model.draft.routine.timezone });
  }
  const destination = proposal.kind === "section" ? proposal.section : proposal.kind === "next" ? followingSection(model.section) : proposal.kind === "complete" ? "call" : null;
  if (!model.snapshot.completedAt && destination && SECTIONS.indexOf(destination) > SECTIONS.indexOf("audit") && model.draft.health.some(Boolean)) {
    const problem = healthScreeningProblem({ answers: model.draft });
    if (problem) return model.dirty && !model.reloadRequired ? saveDraft(model, { next: destination, mode: "explicit" }) : { ...model, section: "audit", showMissing: true, error: problem };
  }
  if (proposal.kind === "discardMarketing") return { ...model, marketingDraft: savedMarketingDraft(model.snapshot.marketing), marketingDirty: false, error: "", message: "Unsaved marketing changes discarded." };
  if (proposal.kind === "saveMarketing" || proposal.kind === "withdrawMarketing") {
    if (model.reloadRequired) return { ...model, error: "Reload saved progress before changing marketing permission." };
    const permission = proposal.kind === "withdrawMarketing" ? emptyMarketingPermission(model.snapshot.marketing.release.version) : model.marketingDraft;
    const problem = marketingGrantProblem(permission);
    return problem ? { ...model, error: problem } : queue({ ...model, marketingDraft: permission, marketingDirty: true }, { kind: "saveMarketing", id, revision: model.snapshot.marketing.revision, permission });
  }
  if (proposal.kind === "refreshBooking") return model.dirty ? { ...model, error: "Save your answers before refreshing your booking." } : queue(model, { kind: "refreshBooking", id });
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
  if (proposal.kind === "autosave") return model.section === "questionnaire" && model.dirty && !model.error && !model.snapshot.completedAt ? saveDraft(model, { next: null, mode: "background" }) : model;
  if (proposal.kind === "save" || proposal.kind === "next" || proposal.kind === "section") {
    const ready = proposal.kind === "next" && model.section === "welcome" ? { ...model, draft: { ...model.draft, acknowledged: { ...model.draft.acknowledged, welcome: true } } } : model;
    return saveDraft(ready, { mode: "explicit", next: proposal.kind === "section" ? proposal.section : proposal.kind === "next" ? followingSection(model.section) : null });
  }
  return model;
}
export function representOnboarding(model: OnboardingModel) {
  const backgroundSaving = model.pending?.kind === "save" && model.pending.mode === "background";
  return { ...model, saving: model.pending?.kind === "save", busy: !!model.pending && !backgroundSaving || model.accountBusy, missing: model.snapshot ? missingRequirements({ ...model.snapshot, answers: model.draft }) : null } as const;
}

export function onboardingNavigation(model: OnboardingModel): NavigationGuard {
  if (model.accountBusy || model.pending && model.pending.kind !== "load" && model.pending.kind !== "navigate") return { kind: "blocked", message: "Wait for your onboarding action to finish before leaving." };
  return model.dirty || model.marketingDirty ? { kind: "confirm", message: "Discard your unsaved onboarding answers or marketing choices? Cancel to save your progress first." } : { kind: "ready" };
}
