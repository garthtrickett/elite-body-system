import { test } from "node:test";
import assert from "node:assert/strict";
import { initialMealModel, acceptMealProposal, emptyMeal } from "../src/features/meals/browser.ts";
function initial() { const model = acceptMealProposal(initialMealModel(), { kind: "started" }); return acceptMealProposal(model, { kind: "completed", id: 1, effectKind: "load", result: { ok: true, value: { date: "2026-10-20", entries: [], favorites: [], analysisAvailable: true } } }); }
const requestId = "00112233-4455-4677-8899-aabbccddeeff";
test("meal estimates are reviewed explicitly and stale/wrong completions cannot change the model", () => {
  const model = acceptMealProposal(initial(), { kind: "descriptionChanged", value: "Rice" });
  const pending = acceptMealProposal(model, { kind: "analysisRequested" }); assert.ok(pending.pending?.kind === "analyze");
  assert.equal(acceptMealProposal(pending, { kind: "completed", id: pending.pending.id, effectKind: "load", result: { ok: true, value: model.snapshot! } }), pending);
  assert.equal(acceptMealProposal(pending, { kind: "analyzed", id: 0, result: { ok: true, value: emptyMeal() } }), pending);
  const reviewed = acceptMealProposal(pending, { kind: "analyzed", id: pending.pending.id, result: { ok: true, value: emptyMeal() } });
  assert.ok(reviewed.draft); assert.equal(reviewed.pending, null); assert.equal(reviewed.snapshot?.entries.length, 0);
});
test("a lost log response freezes the request payload and reuses its idempotency key on retry", () => {
  let model = acceptMealProposal(initial(), { kind: "manualRequested" });
  model = acceptMealProposal(model, { kind: "fieldChanged", index: 0, field: "energy", value: "200" });
  model = acceptMealProposal(model, { kind: "logRequested", requestId });
  const sent = model.pending; assert.ok(sent?.kind === "log"); assert.equal(sent.meal.items[0]?.per100.energy, 200);
  model = acceptMealProposal(model, { kind: "completed", id: sent.id, effectKind: "log", result: { ok: false, error: { code: "unavailable", message: "Lost response" } } });
  assert.equal(acceptMealProposal(model, { kind: "draftNamed", value: "Changed" }), model);
  model = acceptMealProposal(model, { kind: "retry" }); assert.ok(model.pending?.kind === "log"); assert.equal(model.pending.requestId, requestId); assert.deepEqual(model.pending.meal, sent.meal); assert.notEqual(model.pending.id, sent.id);
});
test("invalid portions do not corrupt nutrition and manual corrections change provenance", () => {
  let model = acceptMealProposal(initial(), { kind: "manualRequested" });
  model = acceptMealProposal(model, { kind: "fieldChanged", index: 0, field: "grams", value: "-20" });
  model = acceptMealProposal(model, { kind: "logRequested", requestId }); assert.ok(model.error); assert.equal(model.pending, null); assert.equal(model.draft?.items[0]?.grams, 100);
  model = acceptMealProposal(model, { kind: "fieldChanged", index: 0, field: "grams", value: "150" });
  model = acceptMealProposal(model, { kind: "fieldChanged", index: 0, field: "energy", value: "200" });
  model = acceptMealProposal(model, { kind: "fieldCommitted", index: 0, field: "energy" }); assert.equal(model.draft?.items[0]?.grams, 150); assert.equal(model.draft?.items[0]?.source, "manual");
});
