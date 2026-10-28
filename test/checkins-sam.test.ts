import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptCheckinProposal as accept, initialCheckinModel, representCheckin, checkinNavigation } from "../src/features/checkins/browser-model.ts";
import { blankAnswers, incompleteSections, weeklyPeriod, firstSaturday, parseAnswers, parseEntry, parseSnapshot } from "../src/features/checkins/data.ts";
import { checkinEntry, checkinSnapshot, completeAnswers } from "./support/checkins.ts";
const loaded = (snapshot = checkinSnapshot()) => accept(accept(initialCheckinModel(), { kind: "started" }), { kind: "completed", id: 1, effectKind: "load", result: { ok: true, value: snapshot } });

test("Saturday boundaries follow local time, DST and enrolment rather than browser dates", () => {
  const context = { timezone: "America/New_York", firstWeek: "2026-10-31", hour: 9 };
  assert.equal(firstSaturday("2026-10-28"), "2026-10-31");
  assert.deepEqual(weeklyPeriod({ ...context, now: new Date("2026-10-31T12:59:59Z") }), { week: "2026-10-31", due: false });
  assert.deepEqual(weeklyPeriod({ ...context, now: new Date("2026-10-31T13:00:00Z") }), { week: "2026-10-31", due: true });
  assert.deepEqual(weeklyPeriod({ ...context, now: new Date("2026-11-07T13:59:59Z") }), { week: "2026-10-31", due: true });
  assert.deepEqual(weeklyPeriod({ ...context, now: new Date("2026-11-07T14:00:00Z") }), { week: "2026-11-07", due: true });
  assert.deepEqual(weeklyPeriod({ ...context, timezone: "Pacific/Auckland", now: new Date("2026-10-30T20:00:00Z") }), { week: "2026-10-31", due: true });
});

test("Complete reveals every missing visible section and legacy submitted history remains readable", () => {
  const invalid = accept(loaded(), { kind: "submit" });
  assert.deepEqual(representCheckin(invalid).incomplete, ["wins", "fundamentals", "effectiveness", "data", "question"]);
  assert.equal(invalid.pending, undefined);
  assert.equal(parseAnswers({ ...completeAnswers(), scores: { ...completeAnswers().scores, training: 11 } }).ok, false);
  assert.equal(parseAnswers({ ...completeAnswers(), data: { ...completeAnswers().data, progressiveOverload: ["unknown"] } }).ok, false);
  const old = checkinEntry({ answers: { ...blankAnswers("2026-10-24"), scores: completeAnswers().scores }, submittedAt: "2026-10-24T10:00:00Z" });
  assert.ok(parseEntry(old)); assert.equal(parseSnapshot({ ...checkinSnapshot(), flowPreview: "yes" }), undefined);
  assert.deepEqual(incompleteSections({ answers: completeAnswers(), rawMeasurements: { weight: "80", waist: "82", muscle: "38" } }), []);
});

test("autosave preserves newer typing, raw partial measurements and the acknowledged revision", () => {
  let model = accept(loaded(), { kind: "measure", field: "weight", value: "2" });
  model = accept(model, { kind: "autosave", generation: model.generation }); const first = model.pending; assert.ok(first?.kind === "save");
  assert.equal(first.submit, false); assert.equal(first.answers.data.weight, null); assert.equal(first.rawMeasurements.weight, "2");
  model = accept(model, { kind: "text", field: "wins", value: "Newer typing " });
  assert.equal(model.draft.wins, "Newer typing ");
  assert.equal(accept(model, { kind: "completed", id: 999, effectKind: "save", result: { ok: true, value: checkinSnapshot() } }), model);
  model = accept(model, { kind: "completed", id: first.id, effectKind: "save", result: { ok: true, value: checkinSnapshot({ current: checkinEntry({ answers: first.answers, rawMeasurements: first.rawMeasurements }) }) } });
  assert.equal(model.draft.wins, "Newer typing "); assert.equal(model.raw.weight, "2"); assert.equal(model.dirty, true);
  model = accept(model, { kind: "autosave", generation: model.generation }); assert.ok(model.pending?.kind === "save");
  assert.equal(model.pending.revision, 1); assert.equal(model.pending.answers.wins, "Newer typing");
});

test("Complete waits for the draft acknowledgement then submits once and focuses Progress", () => {
  let model = loaded(checkinSnapshot({ current: checkinEntry() }));
  model = accept(model, { kind: "text", field: "wins", value: "Latest win" });
  model = accept(model, { kind: "autosave", generation: model.generation }); const draft = model.pending; assert.ok(draft?.kind === "save");
  model = accept(model, { kind: "submit" }); assert.equal(model.submitRequested, true); assert.equal(model.pending, draft);
  model = accept(model, { kind: "completed", id: draft.id, effectKind: "save", result: { ok: true, value: checkinSnapshot({ current: checkinEntry({ revision: 2, answers: draft.answers }) }) } });
  const final = model.pending; assert.ok(final?.kind === "save"); assert.equal(final.submit, true); assert.equal(final.revision, 2);
  const submitted = checkinEntry({ revision: 3, answers: final.answers, submittedAt: "2026-10-24T11:00:00Z" });
  model = accept(model, { kind: "completed", id: final.id, effectKind: "save", result: { ok: true, value: checkinSnapshot({ current: submitted, history: [submitted], required: false }) } });
  assert.equal(model.pending?.kind, "focusProgress");
  assert.equal(accept(model, { kind: "completed", id: final.id, effectKind: "save", result: { ok: true, value: checkinSnapshot() } }), model);
  model = accept(model, { kind: "progressShown", id: model.pending!.id });
  assert.equal(accept(model, { kind: "continue" }).pending?.kind, "navigate");
});

test("uncertain saves retry the frozen payload even after cancelling reload", () => {
  let model = accept(loaded(), { kind: "text", field: "wins", value: "Keep this" });
  model = accept(model, { kind: "autosave", generation: model.generation }); const task = model.pending; assert.ok(task?.kind === "save");
  model = accept(model, { kind: "completed", id: task.id, effectKind: "save", result: { ok: false, error: { code: "unavailable", message: "Lost acknowledgement" } } });
  assert.equal(checkinNavigation(model).kind, "blocked"); assert.equal(accept(model, { kind: "text", field: "wins", value: "Wrong" }), model);
  model = accept(model, { kind: "reload" }); model = accept(model, { kind: "reloadConfirmed", id: model.pending!.id, accepted: false });
  model = accept(model, { kind: "retry" }); assert.ok(model.pending?.kind === "save");
  assert.equal(model.pending.answers, task.answers); assert.equal(model.pending.revision, task.revision); assert.notEqual(model.pending.id, task.id);
});

test("preview Complete shows partial data without fabricating a submission and can return to the form", () => {
  let model = accept(loaded(checkinSnapshot({ flowPreview: true, due: false, required: false })), { kind: "submit" });
  assert.equal(model.pending?.kind, "focusProgress"); assert.equal(model.previewingProgress, true);
  const state = representCheckin(model); assert.equal(state.progressEntries[0]?.submittedAt, null); assert.equal(state.progressEntries[0]?.answers.scores.training, null);
  model = accept(model, { kind: "progressShown", id: model.pending!.id }); assert.equal(accept(model, { kind: "editPreview" }).previewingProgress, false);
  const normal = accept(loaded(checkinSnapshot({ due: false, current: checkinEntry() })), { kind: "submit" }); assert.match(normal.error, /Saturday/); assert.equal(normal.pending, undefined);
});

test("Unchanged clears primary overload and Improved requires exactly one primary choice", () => {
  let model = accept(loaded(checkinSnapshot({ current: checkinEntry() })), { kind: "priorityMovement", value: "unchanged" });
  assert.deepEqual(model.draft.data.progressiveOverload, []);
  model = accept(model, { kind: "priorityMovement", value: "improved" }); model = accept(model, { kind: "submit" }); assert.deepEqual(representCheckin(model).incomplete, ["data"]);
  model = accept(model, { kind: "progressiveOverload", value: "control" }); model = accept(model, { kind: "progressiveOverload", value: "range" }); assert.deepEqual(model.draft.data.progressiveOverload, ["range"]);
});
