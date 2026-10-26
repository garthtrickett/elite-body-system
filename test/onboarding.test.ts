import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { createDatabase } from "../src/platform/database/connection.ts";
import type { AccountsId } from "../src/platform/database/generated/public/Accounts.ts";
import { createOnboarding, createAssessmentMedia, mediaSlots, emptyAnswers, parseAnswers, parseContent, missingRequirements } from "../src/features/onboarding/index.ts";
import type { OnboardingSnapshot } from "../src/features/onboarding/index.ts";
import { createProfiles, createPostgresProfileStore } from "../src/features/profile/index.ts";
import { createScorecards } from "../src/features/scorecard/index.ts";
import { createTraining } from "../src/features/training/index.ts";
import { startTestApp, testDatabaseUrl } from "./support/app.ts";
import { completedProfile } from "./support/client.ts";
import { onboardingContent, onboardingAnswers, memoryAssessmentStorage, jpegBytes, videoBytes } from "./support/onboarding.ts";

const db = createDatabase(testDatabaseUrl()), memory = memoryAssessmentStorage();
const onboarding = createOnboarding({ db }), media = createAssessmentMedia({ db, storage: memory.storage });
let app: Awaited<ReturnType<typeof startTestApp>>;
before(async () => { app = await startTestApp({ onboardingEnabled: true, assessmentStorage: memory.storage }); });
after(async () => { await app.close(); await db.destroy(); });
async function account() {
  const email = `onboarding-${randomUUID()}@example.test`;
  const result = await app.auth.provisionAccount({ email }); assert.ok(result.ok);
  await app.auth.requestLink({ email, clientKey: randomUUID() });
  const redeemed = await app.auth.redeemLink({ token: new URL(await app.readLink(email)).hash.slice(1) }); assert.ok(redeemed.ok);
  return { id: result.value.id, cookie: `ebs-session=${redeemed.value.sessionToken}` };
}
async function saved(accountId: string) {
  const loaded = await onboarding.get({ accountId }); assert.ok(loaded.ok);
  const result = await onboarding.save({ accountId, revision: loaded.value.revision, contentVersion: loaded.value.content.version, answers: onboardingAnswers() }); assert.ok(result.ok);
  return result.value;
}
async function upload(accountId: string, slot: string, kind: "video" | "image") {
  const bytes = kind === "video" ? videoBytes : jpegBytes;
  const requested = await media.request({ accountId, slot, mediaType: kind === "video" ? "video/mp4" : "image/jpeg", size: bytes.length }); assert.ok(requested.ok, JSON.stringify(requested));
  memory.put(requested.value.id, bytes);
  const finalized = await media.finalize({ accountId, id: requested.value.id }); assert.ok(finalized.ok, JSON.stringify(finalized));
  return finalized.value;
}
async function ready(accountId: string): Promise<OnboardingSnapshot> {
  await saved(accountId);
  for (const slot of mediaSlots(onboardingContent())) await upload(accountId, slot.id, slot.kind);
  const booking = await onboarding.recordBooking({ accountId, booking: { providerId: randomUUID(), eventVersion: 1, status: "confirmed", startsAt: "2026-11-01T10:00:00Z", timezone: "Europe/London", meetUrl: "https://meet.google.com/abc-defg-hij" } }); assert.ok(booking.ok);
  return booking.value;
}

test("onboarding validates ranked permutations and draft data without accepting forged completion fields", () => {
  assert.ok(parseAnswers(emptyAnswers()).ok);
  assert.equal(parseAnswers({ ...onboardingAnswers(), goals: Array(7).fill("strength") }).ok, false);
  assert.equal(parseAnswers({ ...onboardingAnswers(), goals: Array(10).fill("strength") }).ok, false);
  assert.equal(parseAnswers({ ...onboardingAnswers(), goals: ["strength"] }).ok, false);
  assert.equal(parseAnswers({ ...onboardingAnswers(), goals: onboardingAnswers().goals.slice(1) }).ok, false);
  assert.equal(parseAnswers({ ...onboardingAnswers(), goals: ["unknown", ...onboardingAnswers().goals.slice(1)] }).ok, false);
  assert.equal(parseAnswers({ ...onboardingAnswers(), goals: ["consistency", ...onboardingAnswers().goals.slice(1, 7)] }).ok, false);
  assert.equal(parseAnswers({ ...onboardingAnswers(), routine: { ...onboardingAnswers().routine, timezone: "bad/zone" } }).ok, false);
  assert.equal(parseContent({ ...onboardingContent(), strengthVideo: "" }), undefined);
  const parsed = parseAnswers({ ...onboardingAnswers(), completedAt: "2020-01-01", accountId: randomUUID() }); assert.ok(parsed.ok);
  assert.equal("completedAt" in parsed.value, false);
  const a = onboardingAnswers(), c = onboardingContent();
  const missing = missingRequirements({ answers: { ...a, goalsConfirmed: false, questionnaire: { ...a.questionnaire, experience: "" } }, content: c, media: [], booking: null, resolutions: [] });
  assert.equal(missing.questionnaire.length, 2); assert.ok(missing.audit.length); assert.ok(missing.measurements.length); assert.ok(missing.call.length);
});

test("all accounts including legacy-complete profiles are gated on pages and APIs; health and sign-out remain accessible", async () => {
  const a = await account(), profiles = createProfiles({ store: createPostgresProfileStore(db) });
  assert.ok((await profiles.save({ accountId: a.id, revision: 0, profile: completedProfile() })).ok);
  for (const path of ["/", "/training", "/meals", "/mindset/map", "/courses/activity", "/courses/nutrition", "/courses/mindset"]) {
    const result = await fetch(app.origin + path, { headers: { Cookie: a.cookie }, redirect: "manual" });
    assert.equal(result.status, 303); assert.equal(result.headers.get("location"), "/onboarding");
  }
  for (const path of ["state", "training", "meals", "learning"]) {
    const result = await fetch(`${app.origin}/api/client/${path}`, { headers: { Cookie: a.cookie } }); assert.equal(result.status, 403);
    assert.equal((await result.json()).error.reason, "onboarding_required");
  }
  const page = await fetch(app.origin + "/onboarding", { headers: { Cookie: a.cookie } }); assert.equal(page.status, 200);
  const document = await page.text(); assert.match(document, /data-page="onboarding"/);
  const csrf = document.match(/data-csrf="([A-Za-z0-9_-]+)"/)?.[1]; assert.ok(csrf);
  const cookie = `${a.cookie}; ${page.headers.getSetCookie().map(value => value.split(";")[0]).join("; ")}`;
  const headers = { Cookie: cookie, Origin: app.origin, "Content-Type": "application/json", "X-CSRF-Token": csrf };
  for (const path of ["profile", "day", "training", "learning/map", "learning/read-map", "learning/episode", "meals/analyze", "meals/log", "meals/remove", "meals/remove-favorite"]) {
    const result = await fetch(`${app.origin}/api/client/${path}`, { method: "POST", headers, body: JSON.stringify({ revision: 0, profile: { ...completedProfile(), onboardingVersion: "harry-v2" } }) });
    assert.equal(result.status, 403); assert.equal((await result.json()).error.reason, "onboarding_required");
  }
  assert.equal((await fetch(`${app.origin}/api/client/onboarding/save`, { method: "POST", headers: { ...headers, "X-CSRF-Token": "invalid" }, body: "{}" })).status, 403);
  assert.equal((await fetch(app.origin + "/health")).status, 200);
  assert.equal((await fetch(app.origin + "/api/client/onboarding", { headers: { Cookie: a.cookie } })).status, 200);
});

test("unconfigured content cannot complete onboarding; saved answers resume with account ownership and compare-and-swap", async () => {
  const a = await account(), b = await account();
  const initial = await onboarding.get({ accountId: a.id }); assert.ok(initial.ok); assert.equal(initial.value.content.approved, false);
  assert.match(initial.value.content.consentText, /online fitness system to clients worldwide/);
  assert.equal(initial.value.content.healthQuestions.length, 7);
  assert.equal((await onboarding.complete({ accountId: a.id, revision: 0 })).ok, false);
  const draft = await onboarding.save({ accountId: a.id, revision: 0, contentVersion: initial.value.content.version, answers: { ...onboardingAnswers(), consent: { ...onboardingAnswers().consent, version: initial.value.content.consentVersion } } });
  assert.ok(draft.ok); assert.equal(draft.value.consentSignedAt, null);
  assert.ok(draft.value.missing.audit.length);
  assert.equal((await media.request({ accountId: a.id, slot: "photo:front", mediaType: "image/jpeg", size: jpegBytes.length })).ok, false);
  assert.ok((await onboarding.configure({ content: onboardingContent() })).ok);
  const first = await saved(a.id);
  assert.ok(first.consentSignedAt);
  const changed = await Promise.all([onboarding.save({ accountId: a.id, revision: first.revision, contentVersion: first.content.version, answers: { ...first.answers, questionnaire: { ...first.answers.questionnaire, now: "Today" } } }), onboarding.save({ accountId: a.id, revision: first.revision, contentVersion: first.content.version, answers: first.answers })]);
  assert.equal(changed.filter(result => result.ok).length, 1);
  const other = await onboarding.get({ accountId: b.id }); assert.ok(other.ok); assert.equal(other.value.answers.questionnaire.now, "");
  const row = await db.selectFrom("onboarding_records").select("data").where("account_id", "=", a.id as AccountsId).executeTakeFirstOrThrow();
  assert.match(JSON.stringify(row.data), /signedAt/);
});

test("older saved questionnaires keep their answers and require the new final-thought answer", async () => {
  const a = await account(), previous = await saved(a.id);
  await sql`update onboarding_records set data = data #- '{answers,questionnaire,finalThought}' where account_id = ${a.id}`.execute(db);
  const resumed = await onboarding.get({ accountId: a.id }); assert.ok(resumed.ok);
  assert.equal(resumed.value.answers.questionnaire.finalThought, "");
  assert.equal(resumed.value.answers.questionnaire.motivation, previous.answers.questionnaire.motivation);
  assert.equal(resumed.value.answers.questionnaire.transformation, previous.answers.questionnaire.transformation);
  assert.equal(resumed.value.missing.questionnaire.length, 1);
  assert.match(resumed.value.missing.questionnaire[0]!, /final thought/);
  assert.equal(parseAnswers({ ...resumed.value.answers, questionnaire: { ...resumed.value.answers.questionnaire, finalThought: 42 } }).ok, false);
  const updated = await onboarding.save({ accountId: a.id, revision: resumed.value.revision, contentVersion: resumed.value.content.version, answers: { ...resumed.value.answers, questionnaire: { ...resumed.value.answers.questionnaire, finalThought: "I was ready for coaching" } } });
  assert.ok(updated.ok); assert.deepEqual(updated.value.missing.questionnaire, []);
  const reloaded = await onboarding.get({ accountId: a.id }); assert.ok(reloaded.ok);
  assert.equal(reloaded.value.answers.questionnaire.finalThought, "I was ready for coaching");
  assert.equal(reloaded.value.answers.questionnaire.motivation, previous.answers.questionnaire.motivation);
});

test("seven-goal records preserve their order, append new goals and require confirmation before saving the expanded ranking", async () => {
  const a = await account(), previous = await saved(a.id);
  const legacyGoals = ["cardio", "size", "strength", "reduce-pain", "mobility", "get-lean", "energy"];
  await sql`update onboarding_records set data = jsonb_set(data, '{answers,goals}', cast(${JSON.stringify(legacyGoals)} as jsonb)) where account_id = ${a.id}`.execute(db);
  const resumed = await onboarding.get({ accountId: a.id }); assert.ok(resumed.ok);
  assert.deepEqual(resumed.value.answers.goals, [...legacyGoals, "consistency", "health-markers", "mental-wellness"]);
  assert.equal(resumed.value.answers.goalsConfirmed, false);
  assert.deepEqual(resumed.value.answers.questionnaire, previous.answers.questionnaire);
  assert.deepEqual(resumed.value.missing.questionnaire, ["Confirm your goal ranking."]);
  const goals = [...resumed.value.answers.goals].reverse();
  const updated = await onboarding.save({ accountId: a.id, revision: resumed.value.revision, contentVersion: resumed.value.content.version, answers: { ...resumed.value.answers, goals, goalsConfirmed: true } });
  assert.ok(updated.ok); assert.deepEqual(updated.value.missing.questionnaire, []);
  const reloaded = await onboarding.get({ accountId: a.id }); assert.ok(reloaded.ok);
  assert.deepEqual(reloaded.value.answers.goals, goals);
  assert.equal(reloaded.value.answers.goalsConfirmed, true);
});

test("nine-goal records keep their order and require confirmation after Mental wellness is added", async () => {
  const a = await account(), previous = await saved(a.id);
  const goals = ["health-markers", "consistency", "cardio", "size", "strength", "reduce-pain", "mobility", "get-lean", "energy"];
  await sql`update onboarding_records set data = jsonb_set(data, '{answers,goals}', cast(${JSON.stringify(goals)} as jsonb)) where account_id = ${a.id}`.execute(db);
  const resumed = await onboarding.get({ accountId: a.id }); assert.ok(resumed.ok);
  assert.deepEqual(resumed.value.answers.goals, [...goals, "mental-wellness"]);
  assert.deepEqual(resumed.value.answers.questionnaire, previous.answers.questionnaire);
  assert.equal(resumed.value.answers.goalsConfirmed, false);
  assert.deepEqual(resumed.value.missing.questionnaire, ["Confirm your goal ranking."]);
  const ranking = [...resumed.value.answers.goals].reverse();
  const updated = await onboarding.save({ accountId: a.id, revision: resumed.value.revision, contentVersion: resumed.value.content.version, answers: { ...resumed.value.answers, goals: ranking, goalsConfirmed: true } });
  assert.ok(updated.ok);
  const reloaded = await onboarding.get({ accountId: a.id }); assert.ok(reloaded.ok);
  assert.deepEqual(reloaded.value.answers.goals, ranking);
  assert.equal(reloaded.value.answers.goalsConfirmed, true);
});

test("older questionnaires resume with a required blank belief answer and preserve it after saving", async () => {
  const a = await account(), previous = await saved(a.id);
  await sql`update onboarding_records set data = data #- '{answers,questionnaire,belief}' where account_id = ${a.id}`.execute(db);
  const resumed = await onboarding.get({ accountId: a.id }); assert.ok(resumed.ok);
  assert.deepEqual(resumed.value.answers.questionnaire, { ...previous.answers.questionnaire, belief: "" });
  assert.equal(resumed.value.missing.questionnaire.length, 1);
  assert.match(resumed.value.missing.questionnaire[0]!, /Do you believe you're capable/);
  for (const belief of [null, 42, "x".repeat(2001)]) {
    assert.equal(parseAnswers({ ...resumed.value.answers, questionnaire: { ...resumed.value.answers.questionnaire, belief } }).ok, false);
  }
  const belief = "Not yet, because I need help building consistent habits.";
  const updated = await onboarding.save({ accountId: a.id, revision: resumed.value.revision, contentVersion: resumed.value.content.version, answers: { ...resumed.value.answers, questionnaire: { ...resumed.value.answers.questionnaire, belief: `  ${belief}  ` } } });
  assert.ok(updated.ok); assert.deepEqual(updated.value.missing.questionnaire, []);
  const reloaded = await onboarding.get({ accountId: a.id }); assert.ok(reloaded.ok);
  assert.deepEqual(reloaded.value.answers.questionnaire, { ...previous.answers.questionnaire, belief });
});

test("private media rejects other accounts, invalid bytes, oversized files and pending submissions; failed replacement preserves the ready file", async () => {
  const a = await account(), b = await account(); await saved(a.id); await saved(b.id);
  assert.equal((await media.request({ accountId: a.id, slot: "photo:front", mediaType: "image/jpeg", size: 13 * 1024 * 1024 })).ok, false);
  const snapshot = await upload(a.id, "photo:front", "image"), readyFile = snapshot.media.find(item => item.slot === "photo:front")!;
  assert.equal((await media.read({ accountId: b.id, id: readyFile.id })).ok, false);
  assert.equal((await media.remove({ accountId: b.id, id: readyFile.id })).ok, false);
  const requested = await media.request({ accountId: a.id, slot: "photo:front", mediaType: "image/jpeg", size: jpegBytes.length }); assert.ok(requested.ok);
  assert.equal((await media.finalize({ accountId: b.id, id: requested.value.id })).ok, false);
  memory.put(requested.value.id, Buffer.alloc(jpegBytes.length));
  assert.equal((await media.finalize({ accountId: a.id, id: requested.value.id })).ok, false);
  const current = await onboarding.get({ accountId: a.id }); assert.ok(current.ok);
  assert.ok(current.value.media.some(item => item.id === readyFile.id && item.status === "ready"));
  assert.ok((await media.read({ accountId: a.id, id: readyFile.id })).ok);
  assert.ok((await media.remove({ accountId: a.id, id: requested.value.id })).ok);
});

test("completion is atomic and idempotent, initializes one day and preserves legacy dates, weight and history", async () => {
  const a = await account(), profiles = createProfiles({ store: createPostgresProfileStore(db) });
  const legacy = await profiles.save({ accountId: a.id, revision: 0, profile: completedProfile() }); assert.ok(legacy.ok);
  const readyState = await ready(a.id);
  assert.ok(Object.values(readyState.missing).every(items => items.length === 0));
  const finished = await Promise.all([onboarding.complete({ accountId: a.id, revision: readyState.revision }), onboarding.complete({ accountId: a.id, revision: readyState.revision })]);
  assert.ok(finished.every(result => result.ok && result.value.completedAt));
  const profile = await profiles.get({ accountId: a.id }); assert.ok(profile.ok);
  assert.equal(profile.value.profile.startDate, legacy.value.profile.startDate);
  assert.equal(profile.value.profile.startingWeight, legacy.value.profile.startingWeight);
  const history = await createScorecards(db).history({ accountId: a.id }); assert.ok(history.ok); assert.equal(history.value.length, 1);
  assert.equal((await fetch(app.origin, { headers: { Cookie: a.cookie }, redirect: "manual" })).status, 200);
  assert.equal((await fetch(`${app.origin}/api/client/state`, { headers: { Cookie: a.cookie } })).status, 200);
  assert.equal((await profiles.save({ accountId: a.id, revision: profile.value.revision, profile: { ...profile.value.profile, health: { ...profile.value.profile.health, clearance: !profile.value.profile.health.clearance } } })).ok, false);
});

test("a pending assessment cannot finalize after its consent has changed", async () => {
  const a = await account(), current = await saved(a.id);
  const requested = await media.request({ accountId: a.id, slot: "photo:front", mediaType: "image/jpeg", size: jpegBytes.length }); assert.ok(requested.ok);
  memory.put(requested.value.id, jpegBytes);
  assert.ok((await onboarding.save({ accountId: a.id, revision: current.revision, contentVersion: current.content.version, answers: { ...current.answers, consent: { ...current.answers.consent, healthData: false } } })).ok);
  const finalized = await media.finalize({ accountId: a.id, id: requested.value.id }); assert.ok(!finalized.ok); assert.equal(finalized.error.code, "forbidden");
  const loaded = await onboarding.get({ accountId: a.id }); assert.ok(loaded.ok); assert.ok(loaded.value.media.every(item => item.status !== "ready"));
});

test("health-related audit alternatives allow onboarding without granting medical clearance or accepting exercise uploads", async () => {
  const a = await account(), initial = await onboarding.get({ accountId: a.id }); assert.ok(initial.ok);
  const answers = { ...onboardingAnswers(), health: [true, false, false, false, false, false, false], healthDetails: "Needs review" };
  const savedState = await onboarding.save({ accountId: a.id, revision: 0, contentVersion: initial.value.content.version, answers }); assert.ok(savedState.ok);
  assert.equal((await media.request({ accountId: a.id, slot: "strength:pushups", mediaType: "video/mp4", size: videoBytes.length })).ok, false);
  for (const requirement of ["health-audit-alternative", ...mediaSlots(onboardingContent()).filter(slot => !slot.id.startsWith("photo:")).map(slot => slot.id)]) assert.ok((await onboarding.resolveRequirement({ accountId: a.id, requirement, reason: "Assessment deferred pending clinician advice", resolvedBy: "Harry fixture" })).ok);
  for (const slot of mediaSlots(onboardingContent()).filter(slot => slot.id.startsWith("photo:"))) await upload(a.id, slot.id, slot.kind);
  const booked = await onboarding.recordBooking({ accountId: a.id, booking: { providerId: randomUUID(), eventVersion: 2, status: "confirmed", startsAt: "2026-11-01T10:00:00Z", timezone: "UTC", meetUrl: "https://meet.google.com/abc-defg-hij" } }); assert.ok(booked.ok);
  const finished = await onboarding.complete({ accountId: a.id, revision: booked.value.revision }); assert.ok(finished.ok, JSON.stringify(finished));
  const training = await createTraining({ db, profiles: createProfiles({ store: createPostgresProfileStore(db) }) }).get({ accountId: a.id }); assert.ok(training.ok); assert.equal(training.value.blocked, "clearance_required");
  assert.ok((await onboarding.resolveRequirement({ accountId: a.id, requirement: "health-clearance", reason: "Clinician clearance now confirmed", resolvedBy: "Harry fixture" })).ok);
  const cleared = await createTraining({ db, profiles: createProfiles({ store: createPostgresProfileStore(db) }) }).get({ accountId: a.id }); assert.ok(cleared.ok); assert.equal(cleared.value.blocked, null);
});

test("booking cancellation and media deletion invalidate readiness, and stale event versions cannot restore it", async () => {
  const a = await account(), current = await ready(a.id), b = current.booking!;
  const cancelled = await onboarding.recordBooking({ accountId: a.id, booking: { ...b, eventVersion: 3, status: "cancelled" } }); assert.ok(cancelled.ok);
  const replay = await onboarding.recordBooking({ accountId: a.id, booking: { ...b, eventVersion: 2 } }); assert.ok(replay.ok); assert.equal(replay.value.booking?.status, "cancelled");
  assert.equal((await onboarding.complete({ accountId: a.id, revision: current.revision })).ok, false);
  const photo = current.media.find(item => item.slot === "photo:front")!;
  const removed = await media.remove({ accountId: a.id, id: photo.id }); assert.ok(removed.ok); assert.ok(removed.value.missing.measurements.length);
  assert.equal((await onboarding.complete({ accountId: a.id, revision: removed.value.revision })).ok, false);
  assert.equal((await onboarding.recordBooking({ accountId: a.id, booking: { ...b, eventVersion: 4, meetUrl: "https://evil.test/meet" } })).ok, false);
});

test("completion races serialize with file removal and appointment cancellation", async () => {
  const a = await account(), state = await ready(a.id), file = state.media.find(item => item.slot === "photo:front")!;
  const [removed, completion] = await Promise.all([media.remove({ accountId: a.id, id: file.id }), onboarding.complete({ accountId: a.id, revision: state.revision })]);
  assert.ok(removed.ok);
  if (!removed.value.completedAt) assert.equal(completion.ok, false);
  const b = await account(), booked = await ready(b.id);
  const [cancelled, finished] = await Promise.all([onboarding.recordBooking({ accountId: b.id, booking: { ...booked.booking!, eventVersion: 99, status: "cancelled" } }), onboarding.complete({ accountId: b.id, revision: booked.revision })]);
  assert.ok(cancelled.ok);
  if (!cancelled.value.completedAt) assert.equal(finished.ok, false);
});

test("changed health answers invalidate prior clearance, and content archives retain completed evidence", async () => {
  const a = await account(); await saved(a.id);
  const approved = await onboarding.resolveRequirement({ accountId: a.id, requirement: "health-clearance", reason: "Fixture clinician clearance", resolvedBy: "Harry fixture" }); assert.ok(approved.ok);
  const changed = await onboarding.save({ accountId: a.id, revision: approved.value.revision, contentVersion: approved.value.content.version, answers: { ...approved.value.answers, health: [true, false, false, false, false, false, false], healthDetails: "New condition" } }); assert.ok(changed.ok);
  assert.ok(changed.value.missing.audit.some(message => message.includes("clearance")));
  const b = await account(), readyState = await ready(b.id);
  const completed = await onboarding.complete({ accountId: b.id, revision: readyState.revision }); assert.ok(completed.ok);
  assert.equal((await onboarding.configure({ content: { ...onboardingContent(), welcomeText: "Different under same version" } })).ok, false);
  assert.ok((await onboarding.configure({ content: { ...onboardingContent(), version: "fixture-v3", consentVersion: "fixture-consent-v3" } })).ok);
  const unfinished = await onboarding.get({ accountId: a.id }); assert.ok(unfinished.ok); assert.equal(unfinished.value.answers.acknowledged.welcome, false); assert.equal(unfinished.value.answers.consent.accepted, false);
  const historical = await onboarding.get({ accountId: b.id }); assert.ok(historical.ok); assert.equal(historical.value.content.version, "fixture-v2"); assert.ok(historical.value.completedAt);
});

test("a revised screening version or question requires fresh answers before signing new consent evidence", async () => {
  try {
    for (const change of [{ parqVersion: "fixture-parq-revised" }, { healthQuestions: onboardingContent().healthQuestions.map((question, index) => index === 0 ? "A newly approved screening question" : question) }]) {
      assert.ok((await onboarding.configure({ content: onboardingContent() })).ok);
      const a = await account(); await saved(a.id);
      const content = { ...onboardingContent(), version: `screening-${randomUUID()}`, ...change };
      assert.ok((await onboarding.configure({ content })).ok);
      const loaded = await onboarding.get({ accountId: a.id }); assert.ok(loaded.ok);
      assert.deepEqual(loaded.value.answers.health, Array(7).fill(null)); assert.equal(loaded.value.consentSignedAt, null);
      const accepted = await onboarding.save({ accountId: a.id, revision: loaded.value.revision, contentVersion: content.version, answers: { ...loaded.value.answers, consent: { ...loaded.value.answers.consent, accepted: true } } });
      assert.ok(accepted.ok); assert.equal(accepted.value.consentSignedAt, null); assert.ok(accepted.value.missing.audit.includes("Answer every health screening question."));
      const answered = await onboarding.save({ accountId: a.id, revision: accepted.value.revision, contentVersion: content.version, answers: { ...accepted.value.answers, health: Array(7).fill(false) } });
      assert.ok(answered.ok); assert.ok(answered.value.consentSignedAt);
    }
  } finally { await onboarding.configure({ content: onboardingContent() }); }
});

test("content-only updates preserve unchanged screening answers and retain discoverable removable earlier submissions", async () => {
  try {
    assert.ok((await onboarding.configure({ content: onboardingContent() })).ok);
    const a = await account(); await saved(a.id); await upload(a.id, "photo:front", "image");
    const before = await onboarding.get({ accountId: a.id }); assert.ok(before.ok);
    const id = before.value.media.find(item => item.slot === "photo:front")!.id;
    assert.ok((await onboarding.configure({ content: { ...onboardingContent(), version: `content-${randomUUID()}`, welcomeText: "Revised introduction" } })).ok);
    const after = await onboarding.get({ accountId: a.id }); assert.ok(after.ok);
    assert.deepEqual(after.value.answers.health, onboardingAnswers().health);
    assert.equal(after.value.media.length, 0); assert.equal(after.value.previousMedia?.[0]?.id, id);
    assert.ok(after.value.missing.measurements.includes("Submit front photo."));
    assert.ok((await media.read({ accountId: a.id, id })).ok);
    const removed = await media.remove({ accountId: a.id, id }); assert.ok(removed.ok);
    assert.equal(removed.value.previousMedia?.length, 0); assert.equal((await media.read({ accountId: a.id, id })).ok, false);
  } finally { await onboarding.configure({ content: onboardingContent() }); }
});
