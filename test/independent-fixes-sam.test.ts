import { test } from "node:test";
import assert from "node:assert/strict";
import { initialMealModel, acceptMealProposal, representMeals } from "../src/features/meals/browser.ts";

function loaded() {
  const model = acceptMealProposal(initialMealModel(), { kind: "started" });
  return acceptMealProposal(model, { kind: "completed", id: 1, effectKind: "load", result: { ok: true,
    value: { date: "2026-10-20", entries: [], favorites: [], analysisAvailable: false } } });
}
test("meal field feedback follows authoritative numeric limits and recovers without losing edits", () => {
  let model = acceptMealProposal(loaded(), { kind: "manualRequested" });
  model = acceptMealProposal(model, { kind: "fieldChanged", index: 0, field: "energy", value: "abc" });
  assert.equal(representMeals(model).canLog, false);
  assert.match(representMeals(model).fieldErrors["0:energy"] ?? "", /0 and 1,000/);
  model = acceptMealProposal(model, { kind: "logRequested", requestId: "00112233-4455-4677-8899-aabbccddeeff" });
  assert.equal(model.validationAttempt, 1); assert.equal(model.pending, null);
  model = acceptMealProposal(model, { kind: "fieldChanged", index: 0, field: "energy", value: "200" });
  model = acceptMealProposal(model, { kind: "fieldCommitted", index: 0, field: "energy" });
  assert.equal(representMeals(model).canLog, true); assert.deepEqual(representMeals(model).fieldErrors, {});
  assert.equal(representMeals(model).totals?.energy, 200);
  model = acceptMealProposal(model, { kind: "fieldChanged", index: 0, field: "protein", value: "101" });
  assert.ok(representMeals(model).fieldErrors["0:protein"]);
  model = acceptMealProposal(model, { kind: "fieldChanged", index: 0, field: "protein", value: "100" });
  model = acceptMealProposal(model, { kind: "fieldChanged", index: 0, field: "iron", value: "" });
  assert.deepEqual(representMeals(model).fieldErrors, {}); // Unknown micronutrients remain optional.
  model = acceptMealProposal(model, { kind: "draftNamed", value: "" });
  assert.ok(representMeals(model).fieldErrors.name); assert.equal(representMeals(model).canLog, false);
});
test("discard navigation is correlated, cancellable and does not discard an uncertain log", () => {
  let model = acceptMealProposal(loaded(), { kind: "manualRequested" });
  model = acceptMealProposal(model, { kind: "draftNamed", value: "My unfinished lunch" });
  model = acceptMealProposal(model, { kind: "navigationRequested", href: "/training" });
  assert.equal(model.pending?.kind, "confirmNavigation");
  assert.equal(acceptMealProposal(model, { kind: "navigationConfirmed", id: 0, leave: true }), model);
  model = acceptMealProposal(model, { kind: "navigationConfirmed", id: model.pending!.id, leave: false });
  assert.equal(model.pending, null); assert.equal(model.draft?.name, "My unfinished lunch");
  model = acceptMealProposal(model, { kind: "navigationRequested", href: "/training" });
  const confirmationId = model.pending!.id;
  model = acceptMealProposal(model, { kind: "navigationConfirmed", id: confirmationId, leave: true });
  assert.equal(model.pending?.kind, "navigate");
  assert.equal(acceptMealProposal(model, { kind: "navigationConfirmed", id: confirmationId, leave: true }), model);
  let uncertain = acceptMealProposal(loaded(), { kind: "manualRequested" });
  uncertain = acceptMealProposal(uncertain, { kind: "fieldChanged", index: 0, field: "energy", value: "200" });
  uncertain = acceptMealProposal(uncertain, { kind: "logRequested", requestId: "00112233-4455-4677-8899-aabbccddeeff" });
  uncertain = acceptMealProposal(uncertain, { kind: "failed", id: uncertain.pending!.id });
  assert.equal(acceptMealProposal(uncertain, { kind: "navigationRequested", href: "/training" }), uncertain);
  for (const href of ["https://example.com", "//example.com", "/\\example.com"]) {
    const clean = loaded(); assert.equal(acceptMealProposal(clean, { kind: "navigationRequested", href }), clean);
  }
});
