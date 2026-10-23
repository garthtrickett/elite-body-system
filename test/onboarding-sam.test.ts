import { test } from "node:test";
import assert from "node:assert/strict";
import { initialOnboardingModel, acceptOnboarding, representOnboarding } from "../src/features/onboarding/browser.ts";
import { missingRequirements } from "../src/features/onboarding/index.ts";
import type { OnboardingSnapshot } from "../src/features/onboarding/index.ts";
import { onboardingAnswers, onboardingContent } from "./support/onboarding.ts";
function snapshot(): OnboardingSnapshot {
  const evidence = { answers: onboardingAnswers(), content: onboardingContent(), media: [], booking: null, resolutions: [] };
  return { version: "harry-v2", revision: 1, ...evidence, completedAt: null, consentSignedAt: null, missing: missingRequirements(evidence) };
}
function loaded() {
  const initial = acceptOnboarding(initialOnboardingModel(), { kind: "started" });
  return acceptOnboarding(initial, { kind: "completed", id: initial.pending!.id, effectKind: "load", result: { ok: true, value: snapshot() } });
}
test("onboarding accepts only correlated completions, ignores late upload results after cancellation and protects edits", () => {
  const model = loaded();
  const uploading = acceptOnboarding(model, { kind: "upload", selection: 1, slot: "photo:front" });
  const cancelled = acceptOnboarding(uploading, { kind: "cancelUpload" });
  assert.equal(cancelled.pending?.kind, "cancelUpload");
  assert.equal(acceptOnboarding(cancelled, { kind: "completed", id: uploading.pending!.id, effectKind: "upload", result: { ok: true, value: snapshot() } }), cancelled);
  assert.equal(acceptOnboarding(uploading, { kind: "edit", answers: onboardingAnswers() }), uploading);
  assert.equal(acceptOnboarding(uploading, { kind: "completed", id: uploading.pending!.id, effectKind: "save", result: { ok: true, value: snapshot() } }), uploading);
});
test("onboarding saves before advancing incomplete sections and requires reload on revision conflicts", () => {
  const model = loaded(), answers = { ...model.draft, acknowledged: { ...model.draft.acknowledged, welcome: false } };
  const edited = acceptOnboarding(model, { kind: "edit", answers }), saving = acceptOnboarding(edited, { kind: "next" });
  assert.equal(saving.pending?.kind, "save");
  const result = { ...snapshot(), answers, missing: missingRequirements({ ...snapshot(), answers }) };
  const saved = acceptOnboarding(saving, { kind: "completed", id: saving.pending!.id, effectKind: "save", result: { ok: true, value: result } });
  assert.equal(saved.section, "questionnaire"); assert.equal(saved.showMissing, false); assert.ok(saved.snapshot?.missing.welcome.length);
  const attempted = acceptOnboarding(edited, { kind: "save" });
  const conflicted = acceptOnboarding(attempted, { kind: "completed", id: attempted.pending!.id, effectKind: "save", result: { ok: false, error: { code: "conflict", message: "Reload" } } });
  assert.equal(conflicted.reloadRequired, true); assert.equal(conflicted.dirty, true);
  assert.equal(acceptOnboarding(conflicted, { kind: "edit", answers: onboardingAnswers() }), conflicted);
});
test("onboarding protects unsaved answers during sign-out and restores editing after an account failure", () => {
  const edited = acceptOnboarding(loaded(), { kind: "edit", answers: { ...onboardingAnswers(), routine: { ...onboardingAnswers().routine, name: "Unsaved name" } } });
  const leaving = acceptOnboarding(edited, { kind: "signOut" });
  assert.equal(leaving.pending?.kind, "signOut"); if (leaving.pending?.kind === "signOut") assert.equal(leaving.pending.confirm, true);
  const cancelled = acceptOnboarding(leaving, { kind: "signOutConfirmed", id: leaving.pending!.id, accepted: false });
  assert.equal(cancelled.dirty, true); assert.equal(cancelled.exiting, false);
  const trying = acceptOnboarding(cancelled, { kind: "signOut" });
  const accepted = acceptOnboarding(trying, { kind: "signOutConfirmed", id: trying.pending!.id, accepted: true }); assert.equal(accepted.exiting, true);
  const failed = acceptOnboarding(accepted, { kind: "accountChanged", busy: false, problem: "Sign out failed" });
  assert.equal(failed.exiting, false); assert.equal(failed.dirty, true); assert.equal(failed.accountProblem, "Sign out failed");
});
test("cancelling an upload preserves newer draft answers when the save fails and the server still has older answers", () => {
  const original = loaded();
  const edited = acceptOnboarding(original, { kind: "edit", answers: { ...original.draft, measurements: { ...original.draft.measurements, waist: "81" } } });
  const uploading = acceptOnboarding(edited, { kind: "upload", selection: 1, slot: "photo:front" });
  const cancelling = acceptOnboarding(uploading, { kind: "cancelUpload" });
  const cancelled = acceptOnboarding(cancelling, { kind: "completed", id: cancelling.pending!.id, effectKind: "cancelUpload", result: { ok: true, value: snapshot() } });
  assert.equal(cancelled.draft.measurements.waist, "81"); assert.equal(cancelled.dirty, true);
  assert.equal(cancelled.snapshot?.revision, 1); assert.match(cancelled.message, /cancelled/);
});
test("failed-save reconciliation retains edited fields and loads other-tab changes to untouched answers", () => {
  const original = loaded();
  const edited = acceptOnboarding(original, { kind: "edit", answers: { ...original.draft, routine: { ...original.draft.routine, name: "My unsaved name" } } });
  const saving = acceptOnboarding(edited, { kind: "save" });
  const failed = acceptOnboarding(saving, { kind: "completed", id: saving.pending!.id, effectKind: "save", result: { ok: false, error: { code: "unavailable", message: "Try again" } } });
  const reloading = acceptOnboarding(failed, { kind: "reload" });
  const remote = { ...snapshot(), revision: 2, answers: { ...snapshot().answers, routine: { ...snapshot().answers.routine, equipment: "New equipment from the other tab" } } };
  const recovered = acceptOnboarding(reloading, { kind: "completed", id: reloading.pending!.id, effectKind: "load", result: { ok: true, value: remote } });
  assert.equal(recovered.draft.routine.name, "My unsaved name"); assert.equal(recovered.draft.routine.equipment, "New equipment from the other tab");
  assert.equal(recovered.dirty, true); assert.equal(recovered.reloadRequired, false); assert.equal(recovered.snapshot?.revision, 2);
  const retried = acceptOnboarding(recovered, { kind: "save" }); assert.equal(retried.pending?.kind, "save");
});
test("reload cannot reapply old screening answers across a protocol change", () => {
  const original = loaded();
  const edited = acceptOnboarding(original, { kind: "edit", answers: { ...original.draft, health: [true, false, false, false, false, false, false] } });
  const loading = acceptOnboarding(edited, { kind: "reload" });
  const saved = { ...snapshot(), content: { ...onboardingContent(), version: "new-screening", parqVersion: "new-parq" }, answers: { ...onboardingAnswers(), health: Array(7).fill(null), consent: { ...onboardingAnswers().consent, accepted: false } } };
  const recovered = acceptOnboarding(loading, { kind: "completed", id: loading.pending!.id, effectKind: "load", result: { ok: true, value: saved } });
  assert.deepEqual(recovered.draft.health, Array(7).fill(null)); assert.equal(recovered.draft.consent.accepted, false);
});
test("upload cancellation is unavailable once the finalization transaction starts", () => {
  const uploading = acceptOnboarding(loaded(), { kind: "upload", slot: "photo:front", selection: 1 });
  const finalizing = acceptOnboarding(uploading, { kind: "uploadFinalizing", id: uploading.pending!.id });
  assert.equal(finalizing.finalizing, true); assert.equal(acceptOnboarding(finalizing, { kind: "cancelUpload" }), finalizing);
});
test("recovery keeps goal confirmation attached to the exact ranking that was confirmed", () => {
  const original = loaded();
  const base = { ...original, snapshot: { ...original.snapshot!, answers: { ...original.snapshot!.answers, goalsConfirmed: false } }, draft: { ...original.draft, goalsConfirmed: false } };
  const goals = [...base.draft.goals].reverse();
  const edited = acceptOnboarding(base, { kind: "edit", answers: { ...base.draft, goals, goalsConfirmed: false } });
  const loading = acceptOnboarding(edited, { kind: "reload" });
  const remote = { ...snapshot(), revision: 2 };
  const recovered = acceptOnboarding(loading, { kind: "completed", id: loading.pending!.id, effectKind: "load", result: { ok: true, value: remote } });
  assert.deepEqual(recovered.draft.goals, goals); assert.equal(recovered.draft.goalsConfirmed, false);
});


function questionnaire() { return acceptOnboarding(loaded(), { kind: "section", section: "questionnaire" }); }
function finishSave(model: ReturnType<typeof initialOnboardingModel>) {
  const effect = model.pending; assert.ok(effect?.kind === "save");
  const saved = { ...model.snapshot!, answers: effect.answers, revision: effect.revision + 1 };
  return acceptOnboarding(model, { kind: "completed", id: effect.id, effectKind: "save", result: { ok: true, value: { ...saved, missing: missingRequirements(saved) } } });
}
test("questionnaire autosave keeps typing editable and retains newer answers and ranking after an older result", () => {
  let model = questionnaire();
  assert.equal(acceptOnboarding(model, { kind: "autosave" }), model);
  model = acceptOnboarding(model, { kind: "edit", answers: { ...model.draft, questionnaire: { ...model.draft.questionnaire, motivation: "First draft" } } });
  model = acceptOnboarding(model, { kind: "autosave" });
  assert.ok(model.pending?.kind === "save"); assert.equal(model.pending.mode, "background"); assert.equal(representOnboarding(model).busy, false);
  model = acceptOnboarding(model, { kind: "edit", answers: { ...model.draft, questionnaire: { ...model.draft.questionnaire, motivation: "Newer draft" }, goals: [...model.draft.goals].reverse(), goalsConfirmed: false } });
  const rank = model.draft.goals;
  model = finishSave(model);
  assert.equal(model.draft.questionnaire.motivation, "Newer draft"); assert.deepEqual(model.draft.goals, rank); assert.equal(model.draft.goalsConfirmed, false); assert.equal(model.dirty, true);
  model = finishSave(acceptOnboarding(model, { kind: "autosave" })); assert.equal(model.dirty, false);
  assert.equal(acceptOnboarding(model, { kind: "autosave" }), model);
});
test("Continue during autosave waits for the latest answers before advancing exactly one section", () => {
  let model = questionnaire();
  model = acceptOnboarding(model, { kind: "edit", answers: { ...model.draft, questionnaire: { ...model.draft.questionnaire, now: "First draft" } } });
  model = acceptOnboarding(model, { kind: "autosave" }); const oldId = model.pending!.id;
  model = acceptOnboarding(model, { kind: "edit", answers: { ...model.draft, questionnaire: { ...model.draft.questionnaire, now: "Latest reason" } } });
  model = acceptOnboarding(model, { kind: "next" }); assert.equal(model.pending!.id, oldId); assert.equal(representOnboarding(model).busy, true);
  model = finishSave(model); assert.equal(model.section, "questionnaire"); assert.ok(model.pending?.kind === "save"); assert.equal(model.pending.answers.questionnaire.now, "Latest reason"); assert.equal(model.pending.revision, 2);
  assert.equal(acceptOnboarding(model, { kind: "next" }), model);
  model = finishSave(model); assert.equal(model.section, "audit"); assert.equal(model.dirty, false); assert.equal(model.pending, undefined);
});
test("a failed queued Continue keeps the questionnaire draft and does not advance or retry automatically", () => {
  let model = questionnaire();
  model = acceptOnboarding(model, { kind: "edit", answers: { ...model.draft, questionnaire: { ...model.draft.questionnaire, success: "Keep this answer" } } });
  model = acceptOnboarding(model, { kind: "autosave" }); model = acceptOnboarding(model, { kind: "next" });
  model = acceptOnboarding(model, { kind: "completed", id: model.pending!.id, effectKind: "save", result: { ok: false, error: { code: "unavailable", message: "Temporary outage" } } });
  assert.equal(model.section, "questionnaire"); assert.equal(model.draft.questionnaire.success, "Keep this answer"); assert.equal(model.dirty, true); assert.equal(model.reloadRequired, true);
  assert.equal(acceptOnboarding(model, { kind: "autosave" }).pending, undefined);
});
test("Continue traverses all eight sections while final completion still enforces missing requirements", () => {
  let model = loaded();
  for (const section of ["questionnaire", "audit", "communication", "measurements", "lifestyle", "rhythm", "call"] as const) {
    model = finishSave(acceptOnboarding(model, { kind: "next" })); assert.equal(model.section, section);
  }
  model = acceptOnboarding(model, { kind: "complete" }); assert.equal(model.pending, undefined); assert.equal(model.section, "audit"); assert.equal(model.showMissing, true); assert.match(model.error, /remaining requirements/);
});

test("recovery retains a reverted answer after an uncertain autosave while merging untouched server updates", () => {
  let model = questionnaire(); const original = model.draft.questionnaire.transformation;
  model = acceptOnboarding(model, { kind: "edit", answers: { ...model.draft, questionnaire: { ...model.draft.questionnaire, transformation: "A temporary change" } } });
  model = acceptOnboarding(model, { kind: "autosave" }); const effect = model.pending; assert.ok(effect?.kind === "save");
  model = acceptOnboarding(model, { kind: "edit", answers: { ...model.draft, questionnaire: { ...model.draft.questionnaire, transformation: original } } });
  model = acceptOnboarding(model, { kind: "completed", id: effect.id, effectKind: "save", result: { ok: false, error: { code: "unavailable", message: "Lost response" } } });
  assert.equal(model.dirty, true);
  model = acceptOnboarding(model, { kind: "reload" }); const loading = model.pending; assert.ok(loading?.kind === "load");
  const remote = { ...snapshot(), revision: 3, answers: { ...effect.answers, routine: { ...effect.answers.routine, equipment: "Other tab equipment" } } };
  model = acceptOnboarding(model, { kind: "completed", id: loading.id, effectKind: "load", result: { ok: true, value: remote } });
  assert.equal(model.draft.questionnaire.transformation, original); assert.equal(model.draft.routine.equipment, "Other tab equipment"); assert.equal(model.dirty, true);
  model = finishSave(acceptOnboarding(model, { kind: "autosave" })); assert.equal(model.dirty, false); assert.equal(model.snapshot?.answers.questionnaire.transformation, original);
});


test("autosave preserves raw spaces while semantic saved status uses server-normalized answers", () => {
  let model = questionnaire(); const raw = "I want to ";
  model = acceptOnboarding(model, { kind: "edit", answers: { ...model.draft, questionnaire: { ...model.draft.questionnaire, transformation: raw } } });
  model = acceptOnboarding(model, { kind: "autosave" }); const effect = model.pending; assert.ok(effect?.kind === "save");
  const saved = { ...snapshot(), revision: 2, answers: { ...effect.answers, questionnaire: { ...effect.answers.questionnaire, transformation: raw.trim() } } };
  model = acceptOnboarding(model, { kind: "completed", id: effect.id, effectKind: "save", result: { ok: true, value: saved } });
  assert.equal(model.draft.questionnaire.transformation, raw); assert.equal(model.dirty, false); assert.equal(acceptOnboarding(model, { kind: "autosave" }), model);
  model = acceptOnboarding(model, { kind: "edit", answers: { ...model.draft, questionnaire: { ...model.draft.questionnaire, transformation: model.draft.questionnaire.transformation + "train" } } });
  model = acceptOnboarding(model, { kind: "autosave" }); assert.ok(model.pending?.kind === "save"); assert.equal(model.pending.answers.questionnaire.transformation, "I want to train");
});
