import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "kysely";
import { createAuth, createPostgresAuthStore, LINK_ACKNOWLEDGEMENT } from "../src/features/auth/index.ts";
import type { Auth, AuthStore } from "../src/features/auth/index.ts";
import { createDatabase } from "../src/platform/database/connection.ts";
import { testDatabaseUrl } from "./support/app.ts";

const db = createDatabase(testDatabaseUrl());
const store = createPostgresAuthStore(db);
const messages: { email: string; link: string }[] = [];
const makeAuth = (override: Partial<AuthStore> = {}): Auth => createAuth({
  store: { ...store, ...override }, publicOrigin: "https://example.test", rateKey: "a".repeat(64),
  deliverLink: async ({ email, link }) => { messages.push({ email, link }); },
});
const auth = makeAuth();
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

beforeEach(async () => {
  await sql`truncate accounts, auth_rate_limits cascade`.execute(db);
  messages.length = 0;
});
after(async () => { await db.destroy(); });

async function issuedToken(): Promise<string> {
  assert.equal((await auth.provisionAccount({ email: "member@example.test" })).ok, true);
  assert.equal((await auth.requestLink({ email: "member@example.test", clientKey: "client" })).ok, true);
  const token = messages.at(-1)?.link.split("#")[1];
  assert.ok(token);
  return token;
}
async function signedIn(): Promise<string> {
  const result = await auth.redeemLink({ token: await issuedToken() });
  assert.ok(result.ok);
  return result.value.sessionToken;
}

test("account provisioning is validated and idempotent; domain normalization preserves mailbox case", async () => {
  const first = await auth.provisionAccount({ email: "Member@EXAMPLE.TEST" });
  const second = await auth.provisionAccount({ email: " Member@example.test " });
  assert.deepEqual(first, second);
  assert.ok(first.ok);
  assert.equal(first.value.email, "Member@example.test");
  for (const email of ["not-email", "a\r\n@example.test", "a..b@example.test", {}, null, "a@bad_domain.test"]) {
    assert.deepEqual(await auth.provisionAccount({ email }), { ok: false, error: { code: "invalid_input" } });
  }
});

test("nonmembers and throttled callers receive the same acknowledgement as members", async () => {
  const unknown = await auth.requestLink({ email: "unknown@example.test", clientKey: "client" });
  assert.deepEqual(unknown, { ok: true, value: { message: LINK_ACKNOWLEDGEMENT } });
  assert.equal(messages.length, 0);
  await issuedToken();
  for (let i = 0; i < 7; i++) {
    assert.deepEqual(await auth.requestLink({ email: "member@example.test", clientKey: `client-${i}` }), unknown);
  }
  assert.equal(messages.length, 5);
});

test("inspection does not consume a link; PostgreSQL contains digests rather than bearer tokens", async () => {
  const token = await issuedToken();
  assert.equal(token.length, 43);
  assert.equal((await auth.inspectLink({ token })).ok, true);
  assert.equal((await auth.inspectLink({ token })).ok, true);
  const challenges = await db.selectFrom("auth_challenges").selectAll().execute();
  assert.equal(challenges[0]?.digest, digest(token));
  assert.equal(JSON.stringify(challenges).includes(token), false);
  const session = await auth.redeemLink({ token });
  assert.ok(session.ok);
  const stored = await db.selectFrom("auth_sessions").selectAll().execute();
  assert.equal(stored[0]?.digest, digest(session.value.sessionToken));
  assert.equal(JSON.stringify(stored).includes(session.value.sessionToken), false);
  assert.deepEqual(await auth.redeemLink({ token }), { ok: false, error: { code: "invalid_link" } });
});

test("concurrent redemption through independent connections has exactly one winner", async () => {
  const token = await issuedToken();
  const secondDb = createDatabase(testDatabaseUrl());
  const other = createAuth({ store: createPostgresAuthStore(secondDb), rateKey: "a".repeat(64),
    publicOrigin: "https://example.test", deliverLink: async () => {} });
  try {
    const outcomes = await Promise.all(Array.from({ length: 8 }, (_, i) =>
      (i % 2 ? auth : other).redeemLink({ token })));
    assert.equal(outcomes.filter(result => result.ok).length, 1);
    assert.equal((await db.selectFrom("auth_sessions").selectAll().execute()).length, 1);
  } finally { await secondDb.destroy(); }
});

test("expired links fail, including expiry while waiting for a row lock", async () => {
  const token = await issuedToken();
  await sql`update auth_challenges set expires_at = clock_timestamp() - interval '1 second'`.execute(db);
  assert.equal((await auth.inspectLink({ token })).ok, false);
  assert.equal((await auth.redeemLink({ token })).ok, false);

  const waitingToken = await issuedToken();
  let redeem: ReturnType<Auth["redeemLink"]> | undefined;
  await db.transaction().execute(async trx => {
    await sql`update auth_challenges set expires_at = clock_timestamp() + interval '150 milliseconds'
      where digest = ${digest(waitingToken)}`.execute(trx);
    redeem = auth.redeemLink({ token: waitingToken });
    await delay(250);
  });
  assert.ok(redeem);
  assert.deepEqual(await redeem, { ok: false, error: { code: "invalid_link" } });
});

test("a failed session insert rolls back challenge consumption", async () => {
  const session = await signedIn();
  const token = await issuedToken();
  await assert.rejects(store.redeem({ digest: digest(token), sessionDigest: digest(session) }));
  assert.equal((await auth.redeemLink({ token })).ok, true);
});

test("session reads refresh idle expiry within the absolute deadline; sign-out revokes access", async () => {
  const sessionToken = await signedIn();
  await sql`update auth_sessions set idle_expires_at = clock_timestamp() + interval '1 minute',
    absolute_expires_at = clock_timestamp() + interval '5 minutes'`.execute(db);
  assert.equal((await auth.resolveSession({ sessionToken })).ok, true);
  const row = await db.selectFrom("auth_sessions").selectAll().executeTakeFirstOrThrow();
  assert.equal(row.idle_expires_at.getTime(), row.absolute_expires_at.getTime());
  assert.deepEqual(await auth.signOut({ sessionToken }), { ok: true, value: { signedOut: true } });
  assert.deepEqual(await auth.signOut({ sessionToken }), { ok: true, value: { signedOut: true } });
  assert.deepEqual(await auth.resolveSession({ sessionToken }), { ok: false, error: { code: "unauthenticated" } });
});

test("idle and absolute expiry both reject sessions; account deletion revokes all credentials", async () => {
  const idle = await signedIn();
  await sql`update auth_sessions set idle_expires_at = clock_timestamp() - interval '1 second'`.execute(db);
  assert.equal((await auth.resolveSession({ sessionToken: idle })).ok, false);
  const absolute = await signedIn();
  await sql`update auth_sessions set idle_expires_at = clock_timestamp() - interval '2 seconds',
    absolute_expires_at = clock_timestamp() - interval '1 second'`.execute(db);
  assert.equal((await auth.resolveSession({ sessionToken: absolute })).ok, false);
  const deleted = await signedIn();
  await db.deleteFrom("accounts").execute();
  assert.equal((await auth.resolveSession({ sessionToken: deleted })).ok, false);
  assert.equal((await db.selectFrom("auth_sessions").selectAll().execute()).length, 0);
});

test("client/global budgets persist across callers and reset after their window", async () => {
  const global = digest("global");
  for (let i = 0; i < 201; i++) {
    assert.equal(await store.reserve({ global, client: digest(`client-${i}`), recipient: digest(`recipient-${i}`) }), i < 200);
  }
  await sql`update auth_rate_limits set window_started_at = clock_timestamp() - interval '16 minutes'`.execute(db);
  for (let i = 0; i < 21; i++) {
    assert.equal(await store.reserve({ global, client: digest("same-client"), recipient: digest(`new-recipient-${i}`) }), i < 20);
  }
});

test("delivery failures revoke the issued challenge without exposing account admission", async () => {
  await auth.provisionAccount({ email: "member@example.test" });
  const broken = createAuth({ store, publicOrigin: "https://example.test", rateKey: "a".repeat(64),
    deliverLink: async () => { throw new Error("provider credential must not escape"); } });
  assert.deepEqual(await broken.requestLink({ email: "member@example.test", clientKey: "client" }),
    { ok: true, value: { message: LINK_ACKNOWLEDGEMENT } });
  assert.equal((await db.selectFrom("auth_challenges").selectAll().execute()).length, 0);
});

test("infrastructure failures and malformed tokens return stable typed errors", async () => {
  const broken = makeAuth({ provision: async () => { throw new Error("secret connection string"); },
    inspect: async () => { throw new Error("database offline"); } });
  assert.deepEqual(await broken.provisionAccount({ email: "member@example.test" }), { ok: false, error: { code: "unavailable" } });
  assert.deepEqual(await broken.inspectLink({ token: await issuedToken() }), { ok: false, error: { code: "unavailable" } });
  for (const token of [null, {}, "short", "a".repeat(43)]) {
    assert.equal((await auth.redeemLink({ token })).ok, false);
  }
});
