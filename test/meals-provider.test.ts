import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpenAiMealAnalyzer, parseMealInput, emptyMeal, mealTotals } from "../src/features/meals/index.ts";
import { isRecord } from "../src/shared/validation.ts";
const rawMeal = () => ({ ...emptyMeal(), name: "Yogurt", items: [{ name: "Yogurt", grams: 200, per100: { energy: 80, protein: 10, carbs: 8, fat: 1, fibre: null, iron: null, potassium: null, vitaminC: null } }] });
const responseFor = (meal: unknown, status = "completed") => new Response(JSON.stringify({ status, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(meal) }] }] }), { status: 200 });

test("Luna uses the fixed Responses endpoint, text and image inputs, a strict schema and no stored response", async () => {
  let calls = 0;
  const analyzer = createOpenAiMealAnalyzer({ apiKey: "test-secret", send: async (url, init) => {
    calls++; assert.equal(url, "https://api.openai.com/v1/responses"); assert.equal(init?.redirect, "error");
    const body: unknown = JSON.parse(String(init?.body)); assert.ok(isRecord(body));
    assert.equal(body.model, "gpt-6-luna"); assert.equal(body.store, false);
    assert.ok(isRecord(body.text) && isRecord(body.text.format)); assert.equal(body.text.format.type, "json_schema"); assert.equal(body.text.format.strict, true);
    assert.ok(Array.isArray(body.input)); const first = body.input[0]; assert.ok(isRecord(first) && Array.isArray(first.content)); assert.equal(first.content.length, 2);
    return responseFor(rawMeal());
  } });
  const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString("base64");
  const parsed = parseMealInput({ description: "One serving", photos: [{ mediaType: "image/png", data: png }] }); assert.ok(parsed.ok);
  const result = await analyzer.analyze(parsed.value); assert.ok(result.ok); assert.equal(calls, 1); assert.equal(result.value.items[0]?.source, "ai_estimate");
  assert.equal(mealTotals(result.value).energy, 160); assert.equal(mealTotals(result.value).protein, 20); assert.equal(mealTotals(result.value).iron, null);
});

test("malformed, incomplete, refused and rate-limited responses produce safe typed failures", async () => {
  for (const response of [responseFor({ ...rawMeal(), items: [{ ...rawMeal().items[0], grams: -1 }] }), responseFor(rawMeal(), "incomplete"), new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "Private detail" }] }] })), new Response("sensitive-provider-detail", { status: 500 }), new Response("rate-limited", { status: 429 })]) {
    const result = await createOpenAiMealAnalyzer({ apiKey: "test-secret", send: async () => response }).analyze({ description: "Yogurt", photos: [] });
    assert.ok(!result.ok); assert.doesNotMatch(JSON.stringify(result), /test-secret|sensitive-provider-detail|Private detail/);
  }
  assert.equal(parseMealInput({ description: "", photos: [] }).ok, false);
  assert.equal(parseMealInput({ description: "Rice", photos: [{ mediaType: "image/png", data: Buffer.from("not a PNG image").toString("base64") }] }).ok, false);
  assert.equal(parseMealInput({ description: "Rice", photos: [{ mediaType: "image/jpeg", data: "x".repeat(1398108) }] }).ok, false);
  assert.equal(parseMealInput({ description: "Rice", photos: [{ mediaType: "image/jpeg", url: "http://localhost/secret" }] }).ok, false);
});


test("the maximum supported photo is accepted without regex recursion or exceeding its byte limit", () => {
  const bytes = Buffer.alloc(1048576); bytes[0] = 255; bytes[1] = 216; bytes[2] = 255;
  assert.ok(parseMealInput({ description: "Meal", photos: [{ mediaType: "image/jpeg", data: bytes.toString("base64") }] }).ok);
});
