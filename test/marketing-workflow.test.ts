import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { acceptMarketing, initialMarketing, marketingNavigation } from "../src/features/marketing/browser-model.ts";
import { emptyArticle, buildDraft, parseArticle, notionMarkdown, parseTopics } from "../src/features/marketing/data.ts";
import { brandedDocument } from "../src/features/marketing/export.ts";
import { createProviderPacing, retryDelay } from "../src/features/marketing/pacing.ts";
import { createMarketingProviders } from "../src/features/marketing/provider.ts";
const completeArticle = () => ({ ...emptyArticle(randomUUID()), title: "A week you can repeat", sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk", sourceTitle: "Research source", angle: "Training that fits a founder’s actual week", answers: { problem: "A busy diary breaks a rigid routine.", experience: "Owner’s supplied experience.", mistake: "More complexity is not automatically more progress.", solution: "Choose three realistic sessions. Record them. Review weekly.", proof: "Owner’s supplied story and observed outcome.", action: "Protect your next session." } });

test("marketing drafts use owner answers and keep proof and CTA in both formats", () => {
  const article = buildDraft(completeArticle());
  assert.ok(parseArticle(article)); assert.match(article.blog, /Owner’s supplied story/); assert.match(article.script, /Owner’s supplied story/);
  assert.match(notionMarkdown(article, "https://ebs.example"), /https:\/\/ebs.example\/free-value/);
  assert.match(article.blog, /30 Days, 30 Insights/);
  assert.equal(parseArticle({ ...article, revision: -1 }), undefined);
  assert.equal(parseArticle({ ...article, sourceUrl: "javascript:alert(1)" }), undefined);
  assert.equal(parseArticle({ ...article, images: [{ url: "http://insecure.example/image.jpg", caption: "" }] }), undefined);
  assert.equal(parseTopics([{ id: "a", title: "a", url: article.sourceUrl, channel: "a", publishedAt: "2026-10-01", views: Infinity, viewsPerDay: 2 }]), undefined);
});

test("branded export escapes owner text and image captions and preserves the EBS fonts", () => {
  const article = { ...buildDraft(completeArticle()), title: "<script>alert(1)</script>", blog: "# <img src=x onerror=alert(1)>\n\nText <script>bad</script>", images: [{ url: "https://images.example/a.jpg", caption: '\"><script>bad</script>' }] };
  const output = brandedDocument({ article, origin: "https://ebs.example" });
  assert.doesNotMatch(output, /<script>|<img src=x|onerror=alert\(1\)>/);
  assert.match(output, /&lt;script&gt;/); assert.match(output, /instrument-serif-regular\.woff2/); assert.match(output, /geist\.woff2/);
});

test("marketing SAM rejects stale completions and guards unsaved, recording and pending work", () => {
  let model = acceptMarketing(initialMarketing(), { kind: "start" }); assert.ok(model.pending);
  assert.equal(acceptMarketing(model, { kind: "loaded", id: 999, result: { ok: true, value: { articles: [], nextCursor:null, youtubeAvailable: false, voiceAvailable: false } } }), model);
  model = acceptMarketing(model, { kind: "loaded", id: model.pending.id, result: { ok: true, value: { articles: [], nextCursor:null, youtubeAvailable: true, voiceAvailable: true } } });
  const article = completeArticle(); model = acceptMarketing(model, { kind: "new", id: article.id }); model = acceptMarketing(model, { kind: "edit", article });
  assert.equal(marketingNavigation(model).kind, "confirm");
  const switched = acceptMarketing(model, { kind: "new", id: randomUUID() }); assert.equal(switched.article?.id, article.id);
  model = acceptMarketing(model, { kind: "save", build: false }); assert.equal(marketingNavigation(model).kind, "blocked"); assert.ok(model.pending);
  model = acceptMarketing(model, { kind: "saved", id: model.pending.id, result: { ok: true, value: { ...article, revision: 1 } } }); assert.equal(model.dirty, false);
  model = acceptMarketing(model, { kind: "recordStart", key: "proof" }); assert.ok(model.pending);
  model = acceptMarketing(model, { kind: "recordStarted", id: model.pending.id, result: { ok: true, value: { started: true } } });
  assert.equal(marketingNavigation(model).kind, "blocked"); assert.equal(acceptMarketing(model, { kind: "step", step: "subject" }), model);
  model = acceptMarketing(model, { kind: "recordStop" }); assert.ok(model.pending);
  model = acceptMarketing(model, { kind: "voiced", id: model.pending.id, result: { ok: true, value: { text: "An additional real detail." } } });
  assert.match(model.article!.answers.proof, /Owner’s supplied story.*\n\nAn additional real detail\./); assert.equal(model.recording, null); assert.equal(model.dirty, true);
});

test("pacing is sequential, reserves no more than 80% of configured RPM and does not retry", async () => {
  let now = 100000; const run = createProviderPacing({ requestsPerMinute: 5, now: () => now }); let calls = 0;
  const operation = async () => { calls++; return { ok: true as const, value: true }; };
  assert.ok((await run(operation, 2)).ok); assert.ok(!(await run(operation)).ok); now += 10000;
  assert.ok((await run(operation, 2)).ok); now += 10000; assert.ok(!(await run(operation)).ok); assert.equal(calls, 2);
  now += 60000; assert.ok((await run(operation)).ok);
  let finish: (() => void) | undefined;
  const pending = createProviderPacing({ now: () => now });
  const first = pending(async () => { await new Promise<void>(resolve => { finish = resolve; }); return { ok: true, value: true }; });
  assert.ok(!(await pending(operation)).ok); finish?.(); assert.ok((await first).ok);
  assert.equal(retryDelay("120", 0), 120000); assert.equal(retryDelay("invalid", 0), 60000); assert.equal(retryDelay("0", 0), 10000);
});

test("YouTube research validates source statistics and provider throttles are respected", async () => {
  let now = Date.parse("2026-10-28T12:00:00Z"), calls = 0;
  const provider = createMarketingProviders({ youtubeApiKey: "private-key", now: () => now, send: async () => { calls++; return new Response("private-provider-detail", { status: 429, headers: { "Retry-After": "120" } }); } });
  const first = await provider.research({ query: "fitness" }); assert.ok(!first.ok && first.error.code === "rate_limited");
  await provider.research({ query: "fitness" }); assert.equal(calls, 1); assert.doesNotMatch(JSON.stringify(first), /private-key|private-provider-detail/);
  now += 120000; await provider.research({ query: "fitness" }); assert.equal(calls, 2);
  let step = 0;
  const connected = createMarketingProviders({ youtubeApiKey: "test", now: () => now, send: async url => { step++; const u = new URL(String(url)); assert.equal(u.hostname, "www.googleapis.com"); assert.equal(u.searchParams.get("key"), "test"); return new Response(JSON.stringify(step === 1 ? { items: [{ id: { videoId: "abcdefghijk" } }] } : { items: [{ id: "abcdefghijk", snippet: { title: "Source", channelTitle: "Channel", publishedAt: "2026-10-20T12:00:00Z" }, statistics: { viewCount: "8000" } }] })); } });
  const found = await connected.research({ query: "strength training" }); assert.ok(found.ok); assert.equal(found.value[0]?.url, "https://www.youtube.com/watch?v=abcdefghijk"); assert.equal(step, 2);
});

test("voice transcription is bounded, faithful and explicit about missing configuration", async () => {
  const missing = await createMarketingProviders({}).transcribe({ base64: "YXVkaW8=", mediaType: "audio/webm" }); assert.ok(!missing.ok && missing.error.code === "not_configured");
  let calls = 0;
  const provider = createMarketingProviders({ openAiApiKey: "test-secret", send: async (url, init) => { calls++; assert.equal(url, "https://api.openai.com/v1/audio/transcriptions"); assert.equal(init?.redirect, "error"); assert.ok(init?.body instanceof FormData); assert.equal(init.body.get("model"), "gpt-transcribe"); return new Response(JSON.stringify({ text: "The supplied voice note." })); } });
  assert.ok(!(await provider.transcribe({ base64: "a".repeat(12 * 1024 * 1024 + 1), mediaType: "audio/webm" })).ok); assert.equal(calls, 0);
  const result = await provider.transcribe({ base64: "YXVkaW8=", mediaType: "audio/webm;codecs=opus" }); assert.ok(result.ok); assert.equal(result.value.text, "The supplied voice note."); assert.equal(calls, 1);
});
test("connected writing edits owner answers, keeps the exact proof and never sends identity or secrets in the prompt", async () => {
  const article = completeArticle(); let calls = 0;
  const provider = createMarketingProviders({ openAiApiKey: "private-writing-key", send: async (url, init) => {
    calls++; assert.equal(url, "https://api.openai.com/v1/responses"); const body = JSON.parse(String(init?.body)) as { model: string; store: boolean; input: string; text: { format: { strict: boolean } } }; assert.equal(body.model, "gpt-6-luna"); assert.equal(body.store, false); assert.equal(body.text.format.strict, true); assert.doesNotMatch(body.input, new RegExp(article.id + "|private-writing-key|@example"));
    return new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ hook: "Make the useful action repeatable.", problem: "Edited problem.", experience: "Edited supplied experience.", mistake: "Edited misconception.", solution: "Edited practical steps.", action: "One next action." }) }] }] }));
  } });
  const result = await provider.draft({ article }); assert.ok(result.ok); assert.match(result.value.blog, /Make the useful action repeatable/); assert.ok(result.value.blog.includes(article.answers.proof)); assert.ok(result.value.script.includes(article.answers.proof)); assert.equal(calls, 1);
});
test("a throttled voice note stays correlated to its original question until retry or discard", () => {
  let m = acceptMarketing(initialMarketing(), { kind: "new", id: randomUUID() }); m = acceptMarketing(m, { kind: "voice", key: "proof", uploadId: "browser-audio" }); assert.ok(m.pending);
  m = acceptMarketing(m, { kind: "voiced", id: m.pending.id, retryUploadId: "browser-audio", result: { ok: false, error: { code: "rate_limited", message: "Wait" } } });
  assert.equal(m.voiceRetry?.key, "proof"); assert.equal(marketingNavigation(m).kind, "confirm");
  const blocked = acceptMarketing(m, { kind: "new", id: randomUUID() }); assert.equal(blocked.article?.id, m.article?.id);
  m = acceptMarketing(m, { kind: "retryVoice" }); assert.ok(m.pending?.kind === "voice"); assert.equal(m.pending.uploadId, "browser-audio"); assert.equal(m.pending.key, "proof");
  m = acceptMarketing(m, { kind: "voiced", id: m.pending.id, result: { ok: true, value: { text: "The actual supplied result." } } }); assert.equal(m.voiceRetry, null); assert.equal(m.article?.answers.proof, "The actual supplied result.");
});
