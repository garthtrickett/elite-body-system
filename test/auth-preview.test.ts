import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { createAuth, createPostgresAuthStore, HARRY_PREVIEW_EMAIL } from "../src/features/auth/index.ts";
import { createDatabase } from "../src/platform/database/connection.ts";
import { createScorecards } from "../src/features/scorecard/index.ts";
import { startTestApp, testDatabaseUrl } from "./support/app.ts";
const db = createDatabase(testDatabaseUrl()), store = createPostgresAuthStore(db);
after(async () => { await db.destroy(); });
function auth(enabled: boolean, origin = `https://preview-${randomUUID()}.example.test`) { return createAuth({ store, harryPreview: enabled, publicOrigin: origin, rateKey: "a".repeat(64), deliverLink: async () => { throw new Error("Preview must not send email"); } }); }

test("the shortcut is off by default, requires explicit provisioning, and can only sign into the fixed preview account", async () => {
  const disabled = auth(false), enabled = auth(true);
  assert.deepEqual(await disabled.signInHarryPreview({ alias: "harrybaldwin", clientKey: "client" }), { ok: false, error: { code: "unauthenticated" } });
  // No public request provisions an account.
  assert.equal((await store.findAccount({ email: HARRY_PREVIEW_EMAIL })), undefined);
  assert.equal((await enabled.signInHarryPreview({ alias: "harrybaldwin", clientKey: "client" })).ok, false);
  const account = await enabled.provisionAccount({ email: HARRY_PREVIEW_EMAIL }); assert.ok(account.ok);
  for (const alias of ["harry", "garth", "harrybaldwin@example.test", {}, null]) assert.equal((await enabled.signInHarryPreview({ alias, clientKey: "client" })).ok, false);
  const signedIn = await enabled.signInHarryPreview({ alias: " HarryBaldwin ", clientKey: "client" }); assert.ok(signedIn.ok);
  assert.equal(signedIn.value.account.id, account.value.id);
  const session = await enabled.resolveSession({ sessionToken: signedIn.value.sessionToken }); assert.ok(session.ok); assert.equal(session.value.email, HARRY_PREVIEW_EMAIL);
  assert.deepEqual(await disabled.resolveSession({ sessionToken: signedIn.value.sessionToken }), { ok: false, error: { code: "unauthenticated" } });
  assert.ok((await enabled.signOut({ sessionToken: signedIn.value.sessionToken })).ok);
  assert.equal((await enabled.resolveSession({ sessionToken: signedIn.value.sessionToken })).ok, false);
});

test("preview sign-ins use the existing persistent rate limits and preserve typed failure on storage errors", async () => {
  const enabled = auth(true); await enabled.provisionAccount({ email: HARRY_PREVIEW_EMAIL });
  for (let i = 0; i < 5; i++) assert.ok((await enabled.signInHarryPreview({ alias: "harrybaldwin", clientKey: "same-client" })).ok);
  assert.deepEqual(await enabled.signInHarryPreview({ alias: "harrybaldwin", clientKey: "same-client" }), { ok: false, error: { code: "unauthenticated" } });
  const broken = createAuth({ store: { ...store, findAccount: async () => { throw new Error("private database details"); } }, harryPreview: true, publicOrigin: `https://${randomUUID()}.example.test`, rateKey: "a".repeat(64), deliverLink: async () => {} });
  assert.deepEqual(await broken.signInHarryPreview({ alias: "harrybaldwin", clientKey: "client" }), { ok: false, error: { code: "unavailable" } });
});

test("preview HTTP uses CSRF, isolated account ownership, normal session cookies and revocable sign-out", async () => {
  const app = await startTestApp({ harryPreview: true });
  try {
    const other = await app.auth.provisionAccount({ email: `other-${randomUUID()}@example.test` }); assert.ok(other.ok);
    await app.auth.provisionAccount({ email: HARRY_PREVIEW_EMAIL });
    const cards = createScorecards(db), date = new Date().toISOString().slice(0, 10);
    const otherDay = await cards.get({ accountId: other.value.id, date }); assert.ok(otherDay.ok);
    assert.ok((await cards.save({ accountId: other.value.id, date, revision: 0, scorecard: { ...otherDay.value.scorecard, values: { ...otherDay.value.scorecard.values, energy: 1234 } } })).ok);
    const signIn = await fetch(app.origin + "/sign-in"); const document = await signIn.text();
    const csrf = document.match(/data-csrf="([A-Za-z0-9_-]+)"/)?.[1]; assert.ok(csrf);
    const cookie = signIn.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    const headers = { Origin: app.origin, Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": csrf };
    const url = app.origin + "/api/auth/harry-preview", body = JSON.stringify({ alias: "harrybaldwin" });
    assert.equal((await fetch(url, { method: "POST", headers: { ...headers, Origin: "https://elsewhere.test" }, body })).status, 403);
    assert.equal((await fetch(url, { method: "POST", headers: { ...headers, "X-CSRF-Token": "invalid" }, body })).status, 403);
    assert.equal((await fetch(url, { method: "POST", headers, body: JSON.stringify({ alias: "harrybaldwin", accountId: other.value.id }) })).status, 400);
    const response = await fetch(url, { method: "POST", headers, body }); assert.equal(response.status, 200);
    const result = await response.json(); assert.equal(result.value.email, HARRY_PREVIEW_EMAIL); assert.equal("sessionToken" in result.value, false);
    const session = response.headers.getSetCookie().find(value => value.startsWith("ebs-session=")); assert.ok(session); assert.match(session, /HttpOnly; SameSite=Lax/);
    const sessionCookie = session.split(";")[0]!;
    const get = await fetch(app.origin + "/api/client/state", { headers: { Cookie: sessionCookie } }); const state = await get.json(); assert.ok(state.ok);
    assert.equal(state.value.profile.revision, 0); assert.equal(state.value.history.length, 0);
    const otherHistory = await createScorecards(db).history({ accountId: other.value.id }); assert.ok(otherHistory.ok); assert.equal(otherHistory.value.length, 1); assert.equal(otherHistory.value[0]?.scorecard.values.energy, 1234);
    assert.equal((await readdir(app.outbox)).length, 0);
    const signedOut = await fetch(app.origin + "/api/auth/sign-out", { method: "POST", headers: { ...headers, Cookie: `${sessionCookie}; ${cookie}` }, body: "{}" }); assert.equal(signedOut.status, 200);
    assert.equal((await fetch(app.origin + "/api/auth/session", { headers: { Cookie: sessionCookie } })).status, 401);
  } finally { await app.close(); }
});
