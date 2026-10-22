import { test } from "node:test";
import assert from "node:assert/strict";
import { initialOnboardingModel, acceptOnboarding } from "../src/features/onboarding/browser.ts";
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
test("onboarding saves before navigation, keeps incomplete sections visible and requires reload on revision conflicts", () => {
  const model = loaded(), answers = { ...model.draft, acknowledged: { ...model.draft.acknowledged, welcome: false } };
  const edited = acceptOnboarding(model, { kind: "edit", answers }), saving = acceptOnboarding(edited, { kind: "next" });
  assert.equal(saving.pending?.kind, "save");
  const result = { ...snapshot(), answers, missing: missingRequirements({ ...snapshot(), answers }) };
  const saved = acceptOnboarding(saving, { kind: "completed", id: saving.pending!.id, effectKind: "save", result: { ok: true, value: result } });
  assert.equal(saved.section, "welcome"); assert.equal(saved.showMissing, true);
  const attempted = acceptOnboarding(edited, { kind: "save" });
  const conflicted = acceptOnboarding(attempted, { kind: "completed", id: attempted.pending!.id, effectKind: "save", result: { ok: false, error: { code: "conflict", message: "Reload" } } });
  assert.equal(conflicted.reloadRequired, true); assert.equal(conflicted.dirty, true);
  assert.equal(acceptOnboarding(conflicted, { kind: "edit", answers: onboardingAnswers() }), conflicted);
});
test("onboarding protects unsaved answers during sign-out and restores editing after an account failure", () => {
  const edited = acceptOnboarding(loaded(), { kind: "edit", answers: onboardingAnswers() });
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
