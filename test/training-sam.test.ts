import { test } from "node:test";
import assert from "node:assert/strict";
import { initialTrainingModel, acceptTrainingProposal, representTraining, emptyWorkout } from "../src/features/training/browser.ts";
import type { TrainingSnapshot } from "../src/features/training/index.ts";

const snapshot = (): TrainingSnapshot => ({ workout: emptyWorkout({ date: "2026-10-20", planKey: 2 }), revision: 0, history: [], videoUrls: {}, blocked: null, readOnly: false });
function initial() {
  const model = acceptTrainingProposal(initialTrainingModel({ now: 100000 }), { kind: "started" });
  return acceptTrainingProposal(model, { kind: "loaded", id: 1, result: { ok: true, value: snapshot() } });
}
test("set completion uses prescribed reps, starts a deadline timer and rejects stale completion", () => {
  const first = initial();
  let model = acceptTrainingProposal(first, { kind: "setToggled", id: "dbpress", slot: 0 });
  assert.equal(first.workout?.sets.dbpress, undefined);
  assert.equal(model.workout?.sets.dbpress?.[0]?.reps, 10);
  assert.equal(model.workout?.restUntil, 190000);
  model = acceptTrainingProposal(model, { kind: "clockTicked", now: 150000 });
  assert.equal(representTraining(model).remaining, 40);
  model = acceptTrainingProposal(model, { kind: "clockTicked", now: 200000 });
  assert.equal(representTraining(model).remaining, 0);
  assert.equal(acceptTrainingProposal(model, { kind: "loaded", id: 1, result: { ok: true, value: snapshot() } }), model);
});
test("save results preserve newer set edits and correlate both effect kind and ID", () => {
  let model = initial();
  model = acceptTrainingProposal(model, { kind: "setToggled", id: "dbpress", slot: 0 });
  const pending = model.pending; assert.ok(pending?.kind === "save");
  model = acceptTrainingProposal(model, { kind: "noteChanged", id: "dbpress", value: "Newer note" });
  model = acceptTrainingProposal(model, { kind: "saved", id: pending.id, result: { ok: true, value: { ...snapshot(), workout: pending.workout, revision: 1 } } });
  assert.equal(model.workout?.notes.dbpress, "Newer note");
  assert.ok(model.pending?.kind === "save"); assert.equal(model.pending.revision, 1);
  assert.equal(acceptTrainingProposal(model, { kind: "loaded", id: model.pending.id, result: { ok: true, value: snapshot() } }), model);
});
test("invalid repetitions do not corrupt a set and future/held workouts remain read only", () => {
  let model = initial();
  model = acceptTrainingProposal(model, { kind: "setChanged", id: "dbpress", slot: 0, field: "reps", value: "-1" });
  model = acceptTrainingProposal(model, { kind: "setCommitted", id: "dbpress", slot: 0, field: "reps" });
  assert.match(representTraining(model).fieldErrors["dbpress:0:reps"] ?? "", /whole-number reps/); assert.equal(model.workout?.sets.dbpress, undefined);
  assert.equal(model.pending, undefined); assert.equal(model.drafts["dbpress:0:reps"], "-1");
  let future = acceptTrainingProposal(initialTrainingModel({ now: 100000 }), { kind: "started" });
  future = acceptTrainingProposal(future, { kind: "loaded", id: 1, result: { ok: true, value: { ...snapshot(), readOnly: true } } });
  assert.equal(acceptTrainingProposal(future, { kind: "setToggled", id: "dbpress", slot: 0 }), future);
});

test("date loads reject edits and stale responses, restore the loaded date on failure, and retry the failed date", () => {
  const first = initial();
  let model = acceptTrainingProposal(first, { kind: "dateSelected", date: "2026-10-21" });
  const pending = model.pending; assert.ok(pending?.kind === "load");
  assert.equal(representTraining(model).loading, true);
  assert.equal(acceptTrainingProposal(model, { kind: "noteChanged", id: "dbpress", value: "Wrong date" }), model);
  assert.equal(acceptTrainingProposal(model, { kind: "loaded", id: pending.id - 1, result: { ok: true, value: snapshot() } }), model);
  model = acceptTrainingProposal(model, { kind: "loaded", id: pending.id, result: { ok: false, error: { code: "unavailable", message: "Could not load day" } } });
  assert.equal(model.workout?.date, first.workout?.date);
  assert.equal(model.failedLoadDate, "2026-10-21");
  model = acceptTrainingProposal(model, { kind: "retry" });
  assert.ok(model.pending?.kind === "load"); assert.equal(model.pending.date, "2026-10-21");
  model = acceptTrainingProposal(model, { kind: "loaded", id: model.pending.id, result: { ok: true, value: { ...snapshot(), workout: { ...snapshot().workout, date: "2026-10-21" } } } });
  assert.equal(model.workout?.date, "2026-10-21"); assert.equal(model.failedLoadDate, undefined);
});

test("failed workout saves stop showing saving and require a discard decision before reload", () => {
  let model = acceptTrainingProposal(initial(), { kind: "noteChanged", id: "dbpress", value: "Important unsaved note" });
  model = acceptTrainingProposal(model, { kind: "failed", id: model.pending!.id });
  assert.equal(representTraining(model).saving, false);
  const confirming = acceptTrainingProposal(model, { kind: "reload" }); assert.ok(confirming.pending?.kind === "confirmReload");
  assert.equal(acceptTrainingProposal(confirming, { kind: "reloadConfirmed", id: 999, discard: true }), confirming);
  const kept = acceptTrainingProposal(confirming, { kind: "reloadConfirmed", id: confirming.pending.id, discard: false });
  assert.equal(kept.workout?.notes.dbpress, "Important unsaved note"); assert.equal(kept.error, model.error);
  const second = acceptTrainingProposal({ ...kept, finishRequested: true }, { kind: "reload" });
  const loading = acceptTrainingProposal(second, { kind: "reloadConfirmed", id: second.pending!.id, discard: true }); assert.ok(loading.pending?.kind === "load");
  const loaded = acceptTrainingProposal(loading, { kind: "loaded", id: loading.pending.id, result: { ok: true, value: snapshot() } });
  assert.equal(loaded.finishRequested, false); assert.equal(loaded.workout?.notes.dbpress, undefined);
});

test("uncommitted invalid set drafts prevent date replacement", () => {
  let model = acceptTrainingProposal(initial(), { kind: "setChanged", id: "dbpress", slot: 0, field: "reps", value: "-1" });
  model = acceptTrainingProposal(model, { kind: "dateSelected", date: "2026-10-21" });
  assert.equal(model.pending, undefined); assert.equal(model.drafts["dbpress:0:reps"], "-1");
});

test("recommitting an unchanged set field after Enter does not queue another save", () => {
  let model = acceptTrainingProposal(initial(), { kind: "setChanged", id: "dbpress", slot: 0, field: "reps", value: "10" });
  model = acceptTrainingProposal(model, { kind: "setCommitted", id: "dbpress", slot: 0, field: "reps" });
  const effect = model.pending; assert.ok(effect?.kind === "save");
  model = acceptTrainingProposal(model, { kind: "saved", id: effect.id, result: { ok: true, value: { ...snapshot(), revision: 1, workout: effect.workout } } });
  const blurred = acceptTrainingProposal(model, { kind: "setCommitted", id: "dbpress", slot: 0, field: "reps" });
  assert.equal(blurred.pending, undefined); assert.equal(blurred.generation, model.generation);
});

test("swapping one exercise preserves raw drafts for both its original movement and other exercises", () => {
  let model = acceptTrainingProposal(initial(), { kind: "setChanged", id: "dbpress", slot: 0, field: "reps", value: "7.5" });
  model = acceptTrainingProposal(model, { kind: "swapToggled", id: "lateral" }); assert.equal(model.drafts["dbpress:0:reps"], "7.5");
  model = acceptTrainingProposal(model, { kind: "swapToggled", id: "dbpress" }); assert.equal(model.drafts["dbpress:0:reps"], "7.5");
});

test("set completion reconciles blank drafts with prescribed reps and history weight, keeping unrelated drafts", () => {
  const previous = { ...snapshot().workout, date: "2026-10-13", finishedAt: 90000, sets: { dbpress: [{ kg: 12, reps: 10, done: true }] } };
  let model = acceptTrainingProposal(initialTrainingModel({ now: 100000 }), { kind: "started" });
  model = acceptTrainingProposal(model, { kind: "loaded", id: 1, result: { ok: true, value: { ...snapshot(), history: [previous] } } });
  for (const field of ["kg", "reps"] as const) model = acceptTrainingProposal(model, { kind: "setChanged", id: "dbpress", slot: 0, field, value: "" });
  model = acceptTrainingProposal(model, { kind: "setChanged", id: "lateral", slot: 0, field: "reps", value: "7" });
  model = acceptTrainingProposal(model, { kind: "setToggled", id: "dbpress", slot: 0 });
  assert.equal(model.drafts["dbpress:0:kg"], "12"); assert.equal(model.drafts["dbpress:0:reps"], "10"); assert.equal(model.drafts["lateral:0:reps"], "7");
  const effect = model.pending; assert.ok(effect?.kind === "save");
  model = acceptTrainingProposal(model, { kind: "saved", id: effect.id, result: { ok: true, value: { ...snapshot(), revision: 1, workout: effect.workout } } });
  assert.equal(representTraining(model).fieldErrors["dbpress:0:reps"], undefined);
  model = acceptTrainingProposal(model, { kind: "setChanged", id: "lateral", slot: 0, field: "reps", value: "" });
  assert.equal(representTraining(model).unsaved, false);
  model = acceptTrainingProposal(model, { kind: "setToggled", id: "dbpress", slot: 0 }); assert.equal(model.workout?.sets.dbpress?.[0]?.done, false);
});


test("comma-form set numbers share commit, validation and completion semantics", () => {
  let model = initial();
  for (const [field, value] of [["kg", "12,5"], ["reps", "5,0"]] as const) {
    model = acceptTrainingProposal(model, { kind: "setChanged", id: "dbpress", slot: 0, field, value });
    model = acceptTrainingProposal(model, { kind: "setCommitted", id: "dbpress", slot: 0, field });
    const effect = model.pending; assert.ok(effect?.kind === "save");
    model = acceptTrainingProposal(model, { kind: "saved", id: effect.id, result: { ok: true, value: { ...snapshot(), revision: model.snapshot!.revision + 1, workout: effect.workout } } });
  }
  assert.deepEqual(representTraining(model).fieldErrors, {}); assert.equal(representTraining(model).unsaved, false);
  model = acceptTrainingProposal(model, { kind: "setToggled", id: "dbpress", slot: 0 });
  assert.equal(model.error, ""); assert.deepEqual(model.workout?.sets.dbpress?.[0], { kg: 12.5, reps: 5, done: true });
  assert.equal(model.drafts["dbpress:0:kg"], "12.5"); assert.equal(model.drafts["dbpress:0:reps"], "5");
});
