import { test } from "node:test";
import assert from "node:assert/strict";
import { createMentorSummarizer } from "../src/features/checkins/mentor-provider.ts";
import { acceptMentor, initialMentorModel, mentorNavigation } from "../src/features/checkins/mentor-model.ts";
import { parseMentorQueue, parseMentorSummary } from "../src/features/checkins/mentor-data.ts";
import { isRecord } from "../src/shared/validation.ts";
import { checkinEntry } from "./support/checkins.ts";
const target = { clientId: "00112233-4455-4677-8899-aabbccddeeff", week: "2026-10-24" };
const item = { clientId: target.clientId, clientName: "Client", entry: checkinEntry({ submittedAt: "2026-10-24T10:00:00Z" }), summary: null };
const queue = { items: [item], total: 1, summaryAvailable: true };
const summary = { wentWell: ["Training 8/10"], needsAttention: ["Recovery 6/10"] };
const loaded = () => acceptMentor(acceptMentor(initialMentorModel(), { kind: "started" }), { kind: "queueLoaded", id: 1, result: { ok: true, value: queue } });

test("mentor opens the first check-in, respects collapse on refresh and ignores stale completions", () => {
  let model = loaded(); assert.equal(model.open, `${target.clientId}/${target.week}`);
  model = acceptMentor(model, { kind: "expand", ...target }); assert.equal(model.open, null);
  model = acceptMentor(model, { kind: "refresh" }); const task = model.pending; assert.ok(task);
  assert.equal(acceptMentor(model, { kind: "queueLoaded", id: 0, result: { ok: true, value: queue } }), model);
  model = acceptMentor(model, { kind: "queueLoaded", id: task.id, result: { ok: true, value: queue } }); assert.equal(model.open, null);
  assert.equal(parseMentorQueue({ ...queue, items: [{ ...item, clientId: "wrong" }] }), undefined);
  assert.equal(parseMentorSummary({ ...summary, wentWell: ["x".repeat(701)] }), undefined);
});

test("review waits for server success, retries uncertainty and then removes the row", () => {
  let model = acceptMentor(loaded(), { kind: "review", ...target }); const task = model.pending; assert.ok(task?.kind === "review");
  assert.equal(model.queue?.items.length, 1); assert.equal(mentorNavigation(model).kind, "blocked");
  model = acceptMentor(model, { kind: "reviewed", id: task.id, result: { ok: false, error: { code: "unavailable", message: "Lost response" } } });
  assert.equal(mentorNavigation(model).kind, "blocked"); assert.equal(model.queue?.items.length, 1);
  model = acceptMentor(model, { kind: "retry" }); assert.ok(model.pending?.kind === "review"); assert.equal(model.pending.revision, task.revision);
  model = acceptMentor(model, { kind: "reviewed", id: model.pending.id, result: { ok: true, value: { reviewed: true } } });
  assert.equal(model.queue?.items.length, 0); assert.match(model.status, /✓.*reviewed/); assert.equal(model.pending?.kind, "load");
});

test("AI summaries use validated structured output, a fixed model and no stored provider response", async () => {
  let calls = 0;
  const summarizer = createMentorSummarizer({ apiKey: "test-secret", send: async (url, init) => {
    calls++; assert.equal(url, "https://api.openai.com/v1/responses"); assert.equal(init?.redirect, "error");
    const body: unknown = JSON.parse(String(init?.body)); assert.ok(isRecord(body)); assert.equal(body.model, "gpt-6-luna"); assert.equal(body.store, false);
    assert.ok(isRecord(body.text) && isRecord(body.text.format)); assert.equal(body.text.format.strict, true);
    assert.doesNotMatch(String(body.input), /clientId|accountId|submittedAt|rawMeasurements|test-secret/);
    return new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(summary) }] }] }));
  } });
  const result = await summarizer.summarize({ entries: [item.entry] }); assert.ok(result.ok); assert.deepEqual(result.value, summary); assert.equal(calls, 1);
});

test("missing, refused, incomplete and failed AI responses do not fabricate a summary or leak details", async () => {
  assert.ok(!(await createMentorSummarizer({}).summarize({ entries: [item.entry] })).ok);
  for (const response of [new Response("provider-private", { status: 500 }), new Response("provider-private", { status: 429 }), new Response(JSON.stringify({ status: "incomplete", output: [] })), new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "private" }] }] })), new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ wentWell: "not an array" }) }] }] }))]) {
    const result = await createMentorSummarizer({ apiKey: "test-secret", send: async () => response }).summarize({ entries: [item.entry] });
    assert.ok(!result.ok); assert.doesNotMatch(JSON.stringify(result), /test-secret|provider-private|refusal/);
  }
});
