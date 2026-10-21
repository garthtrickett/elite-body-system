import { test } from "node:test";
import assert from "node:assert/strict";
import { initialProfileUi, acceptProfileProposal, targetProblem, parseProfile, emptyProfile, TARGET_BOUNDS } from "../src/features/profile/browser.ts";
import type { Targets } from "../src/features/profile/browser.ts";
import { initialLearningModel, acceptLearningProposal, representLearning } from "../src/features/learning/browser.ts";
import { emptyMap } from "../src/features/learning/index.ts";

test("target feedback uses the server's numeric limits and refuses invalid saves without losing text", () => {
  for (const field of Object.keys(TARGET_BOUNDS) as (keyof Targets)[]) {
    const [min, max] = TARGET_BOUNDS[field];
    for (const value of [min - 1, max + 1, NaN]) {
      assert.ok(targetProblem({ field, value }));
      assert.equal(parseProfile({ ...emptyProfile(), targets: { ...emptyProfile().targets, [field]: value } }).ok, false);
    }
    for (const value of [min, max]) assert.equal(targetProblem({ field, value }), "");
  }
  let model = acceptProfileProposal(initialProfileUi(emptyProfile()), { kind: "targetChanged", field: "energy", value: "0" });
  model = acceptProfileProposal(model, { kind: "save" });
  assert.equal(model.requestedSave, false); assert.equal(model.validationAttempt, 1);
  assert.equal(model.targetDrafts.energy, "0"); assert.match(model.targetErrors.energy ?? "", /500 and 10,000/);
  model = acceptProfileProposal(model, { kind: "targetChanged", field: "energy", value: "2400" });
  model = acceptProfileProposal(model, { kind: "save" });
  assert.equal(model.requestedSave, true); assert.equal(model.draft.targets.energy, 2400);
});

test("lesson completion identifies every missing answer and clears markers as answers are supplied", () => {
  let model = acceptLearningProposal(initialLearningModel(), { kind: "started" });
  model = acceptLearningProposal(model, { kind: "completed", id: 1, effectKind: "load", result: { ok: true, value: {
    map: emptyMap(), mapRevision: 0, progress: { answers: {}, done: {} }, progressRevision: 0, week: 1, setupComplete: true, mapRead: false, videoUrls: {},
  } } });
  model = acceptLearningProposal(model, { kind: "episodeSelected", id: "m1" });
  model = acceptLearningProposal(model, { kind: "episodeCompleted" });
  assert.deepEqual(representLearning(model).missingAnswers, [0, 1]); assert.equal(model.pending, undefined);
  model = acceptLearningProposal(model, { kind: "answerChanged", index: 0, value: "I keep my promises." });
  assert.deepEqual(representLearning(model).missingAnswers, [1]);
  model = acceptLearningProposal(model, { kind: "answerChanged", index: 1, value: "After breakfast." });
  assert.deepEqual(representLearning(model).missingAnswers, []);
});
