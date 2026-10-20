import { test } from "node:test";
import assert from "node:assert/strict";
import { addGoal, representDay, selectPriority, setMetric, emptyScorecard } from "../src/features/scorecard/index.ts";
import { completedProfile } from "./support/client.ts";
import { acceptScorecardProposal, initialScorecardModel, nextScorecardAction, representScorecard } from "../src/features/scorecard/browser.ts";

const initial = () => {
  const model = acceptScorecardProposal(initialScorecardModel({ email: "preview@example.test", busy: false, problem: "" }), { kind: "started" });
  return acceptScorecardProposal(model, { kind: "clientLoaded", id: model.pending!.id, result: { ok: true, value: {
    profile: { profile: completedProfile(), revision: 1 }, day: { date: new Date().toISOString().slice(0, 10), scorecard: { ...emptyScorecard(), values: { ...emptyScorecard().values, weight: 77.5 } }, revision: 0 }, history: [],
  } } });
};

test("scorecard operations preserve sample target boundaries and reject invalid numbers without mutating inputs", () => {
  const original = initial().day;
  Object.freeze(original.values);
  Object.freeze(original);
  for (const [metric, text, expected] of [
    ["energy", "1900", true], ["energy", "2100", true], ["energy", "2101", false],
    ["protein", "139", false], ["protein", "140", true], ["water", "3.9", false], ["water", "4", true],
    ["sleep", "7:59", false], ["sleep", "8h 30m", true], ["steps", "8,000", true],
  ] as const) {
    const result = setMetric({ scorecard: original, metric, value: text });
    assert.ok(result.ok);
    assert.equal(representDay(result.value).complete[metric], expected);
  }
  for (const [metric, value] of [["weight", "0"], ["sleep", "8:99"], ["steps", "3.5"], ["energy", "Infinity"],
    ["water", "-1"], ["protein", "150 grams"], ["energy", {}]] as const) {
    const result = setMetric({ scorecard: original, metric, value });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "invalid_input");
  }
  assert.equal(original.values.energy, undefined);
  assert.equal(original.values.weight, 77.5);
});

test("SAM preserves a committed metric after invalid editing, supports cancellation and clearing", () => {
  const first = initial();
  let model = acceptScorecardProposal(first, { kind: "metricChanged", metric: "water", value: "4" });
  assert.equal(first.drafts.water, "");
  assert.equal(model.day.values.water, undefined);
  model = acceptScorecardProposal(model, { kind: "metricCommitted", metric: "water" });
  assert.equal(representScorecard(model).complete.water, true);
  model = acceptScorecardProposal(model, { kind: "metricChanged", metric: "water", value: "40" });
  model = acceptScorecardProposal(model, { kind: "metricCommitted", metric: "water" });
  assert.ok(model.errors.water);
  assert.equal(model.day.values.water, 4);
  model = acceptScorecardProposal(model, { kind: "metricCancelled", metric: "water" });
  assert.equal(model.drafts.water, "4");
  assert.equal(model.errors.water, "");
  model = acceptScorecardProposal(model, { kind: "metricChanged", metric: "water", value: "" });
  model = acceptScorecardProposal(model, { kind: "metricCommitted", metric: "water" });
  assert.equal(representScorecard(model).complete.water, false);
});

test("L to R requires a brain dump and one priority; selecting and removing priorities stays immutable", () => {
  const day = initial().day;
  const a = addGoal({ scorecard: day, text: "First goal" });
  assert.ok(a.ok);
  const b = addGoal({ scorecard: a.value, text: "Second goal" });
  assert.ok(b.ok);
  const selected = selectPriority({ scorecard: b.value, id: 1 });
  assert.ok(selected.ok);
  const changed = selectPriority({ scorecard: selected.value, id: 2 });
  assert.ok(changed.ok);
  assert.equal(changed.value.goals.filter(goal => goal.priority).length, 1);
  assert.equal(selected.value.goals[0]?.priority, true);
  assert.equal(representDay(changed.value).complete.ltr, false);
  assert.equal(representDay({ ...changed.value, brainDump: "Things on my mind" }).complete.ltr, true);
  assert.equal(selectPriority({ scorecard: day, id: 5 }).ok, false);
  assert.equal(addGoal({ scorecard: day, text: " " }).ok, false);
});

test("carousel bounds, dialog intents and account updates preserve scorecard edits", () => {
  const first = initial();
  assert.equal(acceptScorecardProposal(first, { kind: "cardSelected", card: 3 }), first);
  let model = acceptScorecardProposal(first, { kind: "touchStarted", x: 200 });
  model = acceptScorecardProposal(model, { kind: "touchEnded", x: 60 });
  assert.equal(model.card, 1);
  model = acceptScorecardProposal(model, { kind: "panelOpened", panel: "profile" });
  assert.deepEqual(nextScorecardAction(model), { kind: "showPanel", panel: "profile" });
  model = acceptScorecardProposal(model, { kind: "checkToggled", check: "training" });
  const account = { email: "preview@example.test", busy: true, problem: "Sign out failed" };
  model = acceptScorecardProposal(model, { kind: "accountChanged", account });
  assert.equal(model.day.checks.training, true);
  assert.equal(model.day.checks.training, true);
  assert.equal(model.account, account);
  model = acceptScorecardProposal(model, { kind: "panelClosed" });
  assert.deepEqual(nextScorecardAction(model), { kind: "closePanel" });
});
