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
