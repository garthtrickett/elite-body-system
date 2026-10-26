import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { createDatabase } from "../src/platform/database/connection.ts";
import type { OnboardingSettings, OnboardingSettingsKey } from "../src/platform/database/generated/public/OnboardingSettings.ts";
import { createOnboarding, createAssessmentMedia, createMarketingPermissions, DRAFT_MARKETING_RELEASE, emptyMarketingPermission, mediaSlots } from "../src/features/onboarding/index.ts";
import { startTestApp, testDatabaseUrl } from "./support/app.ts";
import { onboardingContent, onboardingAnswers, memoryAssessmentStorage, jpegBytes, videoBytes } from "./support/onboarding.ts";

const db = createDatabase(testDatabaseUrl()), memory = memoryAssessmentStorage();
const onboarding = createOnboarding({ db }), marketing = createMarketingPermissions({ db }), media = createAssessmentMedia({ db, storage: memory.storage });
const release = { ...DRAFT_MARKETING_RELEASE, version: "marketing-fixture-v1", approved: true, text: "TEST ONLY optional marketing release." };
const permission = () => ({ ...emptyMarketingPermission(release.version), choices: { ...emptyMarketingPermission().choices, results: true, website: true }, accepted: true, adult: true, signedName: "Alex Example", limitations: "Only my final measurements, no weight." });
let app: Awaited<ReturnType<typeof startTestApp>>;
const settingsKeys = ["content", "marketing-release"] as OnboardingSettingsKey[];
let previousSettings: readonly OnboardingSettings[] = [];
before(async () => {
  previousSettings = await db.selectFrom("onboarding_settings").selectAll().where("key", "in", settingsKeys).execute();
  app = await startTestApp({ onboardingEnabled: true, assessmentStorage: memory.storage });
  assert.ok((await onboarding.configure({ content: onboardingContent() })).ok);
});
after(async () => {
  try {
    await db.transaction().execute(async transaction => {
      await transaction.deleteFrom("onboarding_settings").where("key", "in", settingsKeys).execute();
      if (previousSettings.length) await transaction.insertInto("onboarding_settings").values(previousSettings.map(row => ({ ...row, data: sql`cast(${JSON.stringify(row.data)} as jsonb)` }))).execute();
    });
  } finally { await app.close(); await db.destroy(); }
});
async function account() {
  const email = `marketing-${randomUUID()}@example.test`;
  const provisioned = await app.auth.provisionAccount({ email }); assert.ok(provisioned.ok);
  await app.auth.requestLink({ email, clientKey: randomUUID() });
  const signed = await app.auth.redeemLink({ token: new URL(await app.readLink(email)).hash.slice(1) }); assert.ok(signed.ok);
  return { id: provisioned.value.id, cookie: `ebs-session=${signed.value.sessionToken}` };
}
test("marketing starts unticked, remains separate from health consent and cannot be granted against a draft", async () => {
  const a = await account(), initial = await onboarding.get({ accountId: a.id }); assert.ok(initial.ok);
  assert.deepEqual(initial.value.marketing, { release: DRAFT_MARKETING_RELEASE, revision: 0, record: null });
  const saved = await onboarding.save({ accountId: a.id, revision: 0, contentVersion: initial.value.content.version, answers: onboardingAnswers() }); assert.ok(saved.ok);
  assert.ok(saved.value.consentSignedAt); assert.equal(saved.value.marketing.record, null);
  const forged = await marketing.save({ accountId: a.id, revision: 0, permission: { ...permission(), version: DRAFT_MARKETING_RELEASE.version, approved: true, recordedAt: "2000-01-01", release } });
  assert.equal(forged.ok, false);
  const declined = await marketing.save({ accountId: a.id, revision: 0, permission: emptyMarketingPermission() }); assert.ok(declined.ok);
  assert.equal(declined.value.marketing.record?.action, "declined"); assert.equal(declined.value.revision, saved.value.revision);
  assert.deepEqual(declined.value.missing, saved.value.missing);
  assert.ok((await marketing.configure({ release })).ok);
});
test("grants validate material, channel, explicit acknowledgement, capacity, name and bounded fields", async () => {
  const a = await account(), valid = permission();
  for (const invalid of [
    { ...valid, accepted: false }, { ...valid, adult: false }, { ...valid, signedName: " " },
    { ...valid, signedName: "x".repeat(101) }, { ...valid, limitations: "x".repeat(2001) },
    { ...valid, choices: { ...valid.choices, website: false } }, { ...valid, choices: { ...valid.choices, results: false } },
    { ...valid, choices: { ...valid.choices, paidAds: "yes" } }, { ...valid, version: "stale" },
  ]) assert.equal((await marketing.save({ accountId: a.id, revision: 0, permission: invalid })).ok, false);
  const history = await marketing.history({ accountId: a.id }); assert.ok(history.ok); assert.equal(history.value.length, 0);
});
test("grants save server evidence, isolate accounts and serialize revisions without changing medical consent", async () => {
  const a = await account(), b = await account();
  const prior = await onboarding.save({ accountId: a.id, revision: 0, contentVersion: onboardingContent().version, answers: onboardingAnswers() }); assert.ok(prior.ok);
  const results = await Promise.all([1, 2].map(() => marketing.save({ accountId: a.id, revision: 0, permission: { ...permission(), recordedAt: "2000-01-01", release: { text: "forged" } } })));
  assert.equal(results.filter(r => r.ok).length, 1); assert.ok(results.some(r => !r.ok && r.error.code === "conflict"));
  const grant = results.find(r => r.ok); assert.ok(grant?.ok);
  const record = grant.value.marketing.record; assert.ok(record); assert.equal(record.action, "granted");
  assert.deepEqual(record.permission, permission()); assert.deepEqual(record.release, release); assert.ok(Date.parse(record.recordedAt) > Date.parse("2026-01-01"));
  assert.equal(grant.value.revision, prior.value.revision); assert.equal(grant.value.consentSignedAt, prior.value.consentSignedAt); assert.deepEqual(grant.value.answers, prior.value.answers);
  const duplicate = await marketing.save({ accountId: a.id, revision: 1, permission: permission() }); assert.ok(duplicate.ok); assert.equal(duplicate.value.marketing.revision, 1);
  const other = await onboarding.get({ accountId: b.id }); assert.ok(other.ok); assert.equal(other.value.marketing.record, null);
  const history = await marketing.history({ accountId: a.id }); assert.ok(history.ok); assert.equal(history.value.length, 1);
});
test("document changes preserve original evidence, reject reused versions, and permit withdrawal under unapproved terms", async () => {
  const a = await account(), granted = await marketing.save({ accountId: a.id, revision: 0, permission: permission() }); assert.ok(granted.ok);
  const next = { ...release, version: "marketing-fixture-v2", approved: false, text: "TEST ONLY revised unapproved terms." };
  try {
    assert.equal((await marketing.configure({ release: { ...release, text: "Changed under same version" } })).ok, false);
    assert.ok((await marketing.configure({ release: next })).ok);
    const loaded = await onboarding.get({ accountId: a.id }); assert.ok(loaded.ok); assert.deepEqual(loaded.value.marketing.record, granted.value.marketing.record); assert.deepEqual(loaded.value.marketing.release, next);
    assert.equal((await marketing.save({ accountId: a.id, revision: 1, permission: permission() })).ok, false);
    const withdrawn = await marketing.save({ accountId: a.id, revision: 1, permission: emptyMarketingPermission(release.version) }); assert.ok(withdrawn.ok);
    assert.equal(withdrawn.value.marketing.record?.action, "withdrawn"); assert.deepEqual(withdrawn.value.marketing.record?.permission, emptyMarketingPermission(next.version));
    const history = await marketing.history({ accountId: a.id }); assert.ok(history.ok);
    assert.deepEqual(history.value.map(r => r.action), ["withdrawn", "granted"]); assert.deepEqual(history.value[1], granted.value.marketing.record);
  } finally { assert.ok((await marketing.configure({ release })).ok); }
});
test("completed clients can grant and withdraw through their authenticated endpoint without changing completion", async () => {
  const a = await account(), b = await account();
  assert.ok((await onboarding.save({ accountId: a.id, revision: 0, contentVersion: onboardingContent().version, answers: onboardingAnswers() })).ok);
  for (const slot of mediaSlots(onboardingContent())) {
    const bytes = slot.kind === "video" ? videoBytes : jpegBytes;
    const upload = await media.request({ accountId: a.id, slot: slot.id, mediaType: slot.kind === "video" ? "video/mp4" : "image/jpeg", size: bytes.length }); assert.ok(upload.ok);
    memory.put(upload.value.id, bytes); assert.ok((await media.finalize({ accountId: a.id, id: upload.value.id })).ok);
  }
  const booked = await onboarding.recordBooking({ accountId: a.id, booking: { providerId: randomUUID(), eventVersion: 1, status: "confirmed", startsAt: "2026-11-01T10:00:00Z", timezone: "UTC", meetUrl: "https://meet.google.com/abc-defg-hij" } }); assert.ok(booked.ok);
  const completed = await onboarding.complete({ accountId: a.id, revision: booked.value.revision }); assert.ok(completed.ok); assert.ok(completed.value.completedAt); assert.equal(completed.value.marketing.record, null);
  const page = await fetch(app.origin + "/onboarding", { headers: { Cookie: a.cookie } });
  const csrf = (await page.text()).match(/data-csrf="([A-Za-z0-9_-]+)"/)?.[1]; assert.ok(csrf);
  const headers = { Cookie: `${a.cookie}; ${page.headers.getSetCookie().map(v => v.split(";")[0]).join("; ")}`, Origin: app.origin, "Content-Type": "application/json", "X-CSRF-Token": csrf };
  const body = JSON.stringify({ revision: 0, permission: permission(), accountId: b.id });
  assert.equal((await fetch(app.origin + "/api/client/onboarding/marketing", { method: "POST", headers: { ...headers, "X-CSRF-Token": "invalid" }, body })).status, 403);
  assert.equal((await fetch(app.origin + "/api/client/onboarding/marketing", { method: "POST", headers, body })).status, 200);
  const other = await onboarding.get({ accountId: b.id }); assert.ok(other.ok); assert.equal(other.value.marketing.record, null);
  const withdrawn = await marketing.save({ accountId: a.id, revision: 1, permission: emptyMarketingPermission(release.version) }); assert.ok(withdrawn.ok);
  assert.equal(withdrawn.value.completedAt, completed.value.completedAt); assert.equal(withdrawn.value.revision, completed.value.revision); assert.deepEqual(withdrawn.value.answers, completed.value.answers);
  assert.equal(withdrawn.value.marketing.record?.action, "withdrawn"); assert.ok((await onboarding.eligible({ accountId: a.id })).ok);
  assert.equal((await fetch(app.origin, { headers: { Cookie: a.cookie }, redirect: "manual" })).status, 200);
});
