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

test("reloading unsaved learning work requires an explicit discard decision", () => {
  let model = acceptLearningProposal(initial(), { kind: "mapChanged", key: "identity", value: "Important unsaved identity" });
  const pending = model.pending!;
  model = acceptLearningProposal(model, { kind: "completed", id: pending.id, effectKind: "saveMap", result: { ok: false, error: { code: "conflict", message: "Reload before saving" } } });
  const confirming = acceptLearningProposal(model, { kind: "reload" }); assert.equal(confirming.pending?.kind, "confirmReload");
  const cancelled = acceptLearningProposal(confirming, { kind: "reloadConfirmed", id: confirming.pending!.id, discard: false });
  assert.equal(cancelled.map?.identity, "Important unsaved identity"); assert.ok(cancelled.mapGeneration > cancelled.mapSaved); assert.ok(cancelled.error);
  const second = acceptLearningProposal(cancelled, { kind: "reload" });
  const accepted = acceptLearningProposal(second, { kind: "reloadConfirmed", id: second.pending!.id, discard: true }); assert.equal(accepted.pending?.kind, "load");
});

test("an old Map finish response cannot close newer incomplete edits or queue an endless save", () => {
  const map = { ...emptyMap(), identity: "Identity", build: "Build", refuse: "Refuse", signals: "Signals", leads: "Leads", final: "Final", step: 6 };
  let model = acceptLearningProposal(initialLearningModel(), { kind: "started" });
  model = acceptLearningProposal(model, { kind: "completed", id: model.pending!.id, effectKind: "load", result: { ok: true, value: { ...snapshot(), map, mapRevision: 1 } } });
  model = acceptLearningProposal(model, { kind: "editMap" }); model = acceptLearningProposal(model, { kind: "mapFinished" }); const finishing = model.pending!;
  model = acceptLearningProposal(model, { kind: "mapChanged", key: "final", value: "" });
  model = acceptLearningProposal(model, { kind: "completed", id: finishing.id, effectKind: "saveMap", result: { ok: true, value: { ...snapshot(), map, mapRevision: 2 } } });
  assert.equal(model.editingMap, true); assert.equal(model.map?.final, ""); assert.ok(model.pending?.kind === "saveMap"); assert.equal(model.pending.finish, false);
  const saving = model.pending;
  model = acceptLearningProposal(model, { kind: "completed", id: saving.id, effectKind: "saveMap", result: { ok: true, value: { ...snapshot(), map: saving.map, mapRevision: 3 } } });
  assert.equal(model.pending, undefined); assert.equal(model.editingMap, true);
  model = acceptLearningProposal(model, { kind: "mapChanged", key: "final", value: "A" });
  assert.ok(model.pending?.kind === "saveMap"); assert.equal(model.pending.finish, false); assert.equal(model.finishMap, false);
});

test("an irreversible lesson completion rejects newer task edits while its request is pending", () => {
  let model = acceptLearningProposal(initialLearningModel(), { kind: "started" });
  model = acceptLearningProposal(model, { kind: "completed", id: 1, effectKind: "load", result: { ok: true, value: { ...snapshot(), progress: { answers: { m1: ["Original", "Every morning"] }, done: {} } } } });
  model = acceptLearningProposal(model, { kind: "episodeSelected", id: "m1" });
  model = acceptLearningProposal(model, { kind: "episodeCompleted" }); assert.ok(model.pending?.kind === "saveEpisode"); assert.equal(model.pending.complete, true);
  assert.equal(acceptLearningProposal(model, { kind: "answerChanged", index: 0, value: "Unsavable newer answer" }), model);
});
