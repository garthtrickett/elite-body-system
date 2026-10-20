import { test } from "node:test";
import assert from "node:assert/strict";
import { initialLearningModel, acceptLearningProposal } from "../src/features/learning/browser.ts";
import { emptyMap } from "../src/features/learning/index.ts";
import type { LearningSnapshot } from "../src/features/learning/index.ts";
const snapshot = (): LearningSnapshot => ({ map: emptyMap(), mapRevision: 0, progress: { answers: {}, done: {} }, progressRevision: 0, week: 1, setupComplete: true, mapRead: false, videoUrls: {} });
function initial() { const started = acceptLearningProposal(initialLearningModel(), { kind: "started" }); return acceptLearningProposal(started, { kind: "completed", id: 1, effectKind: "load", result: { ok: true, value: snapshot() } }); }
test("Map editing is immutable and stale or wrong-kind effects cannot overwrite newer text", () => {
  const first = initial();
  let model = acceptLearningProposal(first, { kind: "mapChanged", key: "identity", value: "First" });
  assert.equal(first.map?.identity, ""); const pending = model.pending; assert.ok(pending?.kind === "saveMap");
  model = acceptLearningProposal(model, { kind: "mapChanged", key: "identity", value: "Newer" });
  assert.equal(acceptLearningProposal(model, { kind: "completed", id: pending.id, effectKind: "saveEpisode", result: { ok: true, value: snapshot() } }), model);
  model = acceptLearningProposal(model, { kind: "completed", id: pending.id, effectKind: "saveMap", result: { ok: true, value: { ...snapshot(), map: pending.map, mapRevision: 1 } } });
  assert.equal(model.map?.identity, "Newer"); assert.ok(model.pending?.kind === "saveMap"); assert.equal(model.pending.revision, 1);
});
test("course completion requires every answer and cannot accept a scheduled episode", () => {
  let model = initial(); model = acceptLearningProposal(model, { kind: "episodeSelected", id: "m2" });
  assert.equal(model.episode, undefined); assert.ok(model.error);
  model = acceptLearningProposal(model, { kind: "episodeSelected", id: "m1" });
  model = acceptLearningProposal(model, { kind: "episodeCompleted" }); assert.ok(model.error); assert.equal(model.completeEpisode, false);
});
