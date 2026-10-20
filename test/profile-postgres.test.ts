import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/platform/database/connection.ts";
import { createProfiles, createPostgresProfileStore, emptyProfile, parseProfile, clientDay } from "../src/features/profile/index.ts";
import { createScorecards, emptyScorecard } from "../src/features/scorecard/index.ts";
import { startTestApp, testDatabaseUrl } from "./support/app.ts";
import { completedProfile } from "./support/client.ts";

const db = createDatabase(testDatabaseUrl());
let app: Awaited<ReturnType<typeof startTestApp>>;
before(async () => { app = await startTestApp(); });
after(async () => { await app.close(); await db.destroy(); });
async function account() {
  const email = `profile-${randomUUID()}@example.test`;
  const result = await app.auth.provisionAccount({ email }); assert.ok(result.ok);
  await app.auth.requestLink({ email, clientKey: randomUUID() });
  const redeemed = await app.auth.redeemLink({ token: new URL(await app.readLink(email)).hash.slice(1) }); assert.ok(redeemed.ok);
  return { id: result.value.id, cookie: `ebs-session=${redeemed.value.sessionToken}` };
}

test("profile validation distinguishes drafts from completion and validates schedules, targets and health answers", () => {
  const profile = emptyProfile();
  assert.equal(parseProfile(profile).ok, true);
  assert.equal(parseProfile({ ...profile, completed: true }).ok, false);
  assert.equal(parseProfile({ ...completedProfile(), trainingDays: [1, 1, 4, 5] }).ok, false);
  assert.equal(parseProfile({ ...completedProfile(), restDay: 1 }).ok, false);
  assert.equal(parseProfile({ ...profile, targets: { ...profile.targets, water: -1 } }).ok, false);
  assert.equal(parseProfile({ ...profile, timezone: "Not/AZone" }).ok, false);
  assert.equal(parseProfile({ ...completedProfile(), health: { ...profile.health } }).ok, false);
  assert.equal(clientDay({ timezone: "Pacific/Auckland", now: new Date("2026-10-20T23:30:00Z") }), "2026-10-21");
});

test("profiles are account-scoped, stamped on the server and use compare-and-swap revisions", async () => {
  const a = await account(), b = await account();
  const profiles = createProfiles({ store: createPostgresProfileStore(db), now: () => new Date("2026-10-20T12:00:00Z") });
  const profile = { ...completedProfile(), startDate: "2020-01-01", consent: { ...completedProfile().consent, signedAt: "2020-01-01" } };
  const saved = await profiles.save({ accountId: a.id, revision: 0, profile }); assert.ok(saved.ok);
  assert.equal(saved.value.profile.startDate, "2026-10-20");
  assert.equal(saved.value.profile.consent.signedAt, "2026-10-20T12:00:00.000Z");
  const other = await profiles.get({ accountId: b.id }); assert.ok(other.ok);
  assert.equal(other.value.revision, 0);
  assert.equal(other.value.profile.name, "");
  const simultaneous = await Promise.all([
    profiles.save({ accountId: a.id, revision: 1, profile: { ...saved.value.profile, name: "First edit" } }),
    profiles.save({ accountId: a.id, revision: 1, profile: { ...saved.value.profile, name: "Second edit" } }),
  ]);
  assert.equal(simultaneous.filter(result => result.ok).length, 1);
  const failed = simultaneous.find(result => !result.ok); assert.ok(failed && !failed.ok);
  assert.equal(failed.error.code, "conflict");
  const read = await profiles.get({ accountId: a.id }); assert.ok(read.ok);
  assert.equal(read.value.revision, 2);
  assert.equal(read.value.profile.consent.signedAt, saved.value.profile.consent.signedAt);
});

test("scorecards persist separate dated histories and reject stale writes and malformed JSON", async () => {
  const a = await account(), b = await account(), scorecards = createScorecards(db);
  const day = { ...emptyScorecard(), values: { ...emptyScorecard().values, energy: 2400 }, goals: [{ id: 1, text: "Walk", priority: true }] };
  const saved = await scorecards.save({ accountId: a.id, date: "2026-10-20", revision: 0, scorecard: day }); assert.ok(saved.ok);
  const prior = await scorecards.save({ accountId: a.id, date: "2026-10-19", revision: 0, scorecard: emptyScorecard() }); assert.ok(prior.ok);
  const read = await scorecards.get({ accountId: a.id, date: "2026-10-20" }); assert.ok(read.ok);
  assert.deepEqual(read.value.scorecard, day);
  const other = await scorecards.get({ accountId: b.id, date: "2026-10-20" }); assert.ok(other.ok);
  assert.equal(other.value.revision, 0);
  const history = await scorecards.history({ accountId: a.id }); assert.ok(history.ok);
  assert.deepEqual(history.value.map(item => item.date), ["2026-10-20", "2026-10-19"]);
  const stale = await scorecards.save({ accountId: a.id, date: "2026-10-20", revision: 0, scorecard: day });
  assert.ok(!stale.ok); assert.equal(stale.error.code, "conflict");
  assert.equal((await scorecards.save({ accountId: a.id, date: "2026-02-30", revision: 1, scorecard: day })).ok, false);
  assert.equal((await scorecards.save({ accountId: a.id, date: "2026-10-20", revision: 1, scorecard: { ...day, goals: [{ id: 1, text: "Bad", priority: "yes" }] } })).ok, false);
});

test("client HTTP requires a session and CSRF and never uses a browser-selected account ID", async () => {
  const a = await account(), b = await account();
  assert.equal((await fetch(`${app.origin}/api/client/state`)).status, 401);
  const document = await fetch(app.origin, { headers: { Cookie: a.cookie } });
  const html = await document.text();
  const csrf = html.match(/data-csrf="([A-Za-z0-9_-]+)"/)?.[1]; assert.ok(csrf);
  const cookie = `${a.cookie}; ${document.headers.getSetCookie().map(value => value.split(";")[0]).join("; ")}`;
  const headers = { Cookie: cookie, Origin: app.origin, "Content-Type": "application/json", "X-CSRF-Token": csrf };
  const payload = { accountId: b.id, revision: 0, profile: { ...emptyProfile(), name: "Only mine", accountId: b.id } };
  const denied = await fetch(`${app.origin}/api/client/profile`, { method: "POST", headers: { ...headers, "X-CSRF-Token": "invalid" }, body: JSON.stringify(payload) });
  assert.equal(denied.status, 403);
  const saved = await fetch(`${app.origin}/api/client/profile`, { method: "POST", headers, body: JSON.stringify(payload) }); assert.equal(saved.status, 200);
  const profiles = createProfiles({ store: createPostgresProfileStore(db) });
  const own = await profiles.get({ accountId: a.id }), other = await profiles.get({ accountId: b.id }); assert.ok(own.ok && other.ok);
  assert.equal(own.value.profile.name, "Only mine"); assert.equal(other.value.profile.name, "");
});
