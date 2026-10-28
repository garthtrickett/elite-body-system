import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/platform/database/connection.ts";
import type { AccountsId } from "../src/platform/database/generated/public/Accounts.ts";
import { createPostgresProfileStore } from "../src/features/profile/index.ts";
import { startTestApp, testDatabaseUrl } from "./support/app.ts";
import { completedProfile } from "./support/client.ts";
const db = createDatabase(testDatabaseUrl()), ids: AccountsId[] = [];
let app: Awaited<ReturnType<typeof startTestApp>>;
const masterEmail = `http-master-${randomUUID()}@example.test`;
before(async () => { app = await startTestApp({ masterEmail }); });
after(async () => { await db.deleteFrom("accounts").where("id", "in", ids).execute(); await app.close(); await db.destroy(); });
async function account(email = `portal-http-${randomUUID()}@example.test`) { const a = await app.auth.provisionAccount({ email }); assert.ok(a.ok); ids.push(a.value.id as AccountsId); return a.value.id as AccountsId; }
async function page(path: string, cookie = "") { const response = await fetch(app.origin + path, { redirect: "manual", headers: { Cookie: cookie } }); const body = await response.text(); return { response, body, csrf: body.match(/data-csrf="([A-Za-z0-9_-]+)"/)?.[1] ?? "", cookie: [cookie, ...response.headers.getSetCookie().map(c => c.split(";")[0])].filter(Boolean).join("; ") }; }
async function signed(id: AccountsId) { const a = await db.selectFrom("accounts").select("email").where("id", "=", id).executeTakeFirstOrThrow(); assert.ok((await app.auth.requestLink({ email: a.email, clientKey: randomUUID() })).ok); const session = await app.auth.redeemLink({ token: new URL(await app.readLink(a.email)).hash.slice(1) }); assert.ok(session.ok); return page("/sign-in", `ebs-session=${session.value.sessionToken}`); }
async function post(path: string, body: unknown, session: Awaited<ReturnType<typeof page>>, override: Readonly<Record<string, string>> = {}) { return fetch(app.origin + path, { method: "POST", headers: { Origin: app.origin, Cookie: session.cookie, "Content-Type": "application/json", "X-CSRF-Token": session.csrf, ...override }, body: JSON.stringify(body) }); }

test("master username uses verified email links outside the isolated disabled-email preview", async () => {
  await account(masterEmail); const initial = await page("/master/sign-in"); assert.equal(initial.response.status, 200); assert.match(initial.body, /data-master-preview="false"/);
  const response = await post("/api/auth/master-request", { username: "harrybaldwin" }, initial); assert.equal(response.status, 200); const result = await response.json() as { value: { signedIn: boolean } }; assert.equal(result.value.signedIn, false); assert.equal(response.headers.get("set-cookie"), null);
  const link = new URL(await app.readLink(masterEmail)); assert.equal(link.searchParams.get("next"), "/manage"); assert.ok(link.hash.length > 20);
  assert.equal((await page("/manage")).response.headers.get("location"), "/master/sign-in");
});

test("private routes and writes enforce session identity, role, origin and CSRF", async () => {
  assert.equal((await fetch(app.origin + "/api/marketing/snapshot")).status, 401);
  const member = await account(), session = await signed(member);
  assert.equal((await page("/manage", session.cookie)).response.status, 403); assert.equal((await page("/mentor", session.cookie)).response.status, 403);
  assert.equal((await fetch(app.origin + "/api/management/snapshot", { headers: { Cookie: session.cookie } })).status, 403);
  assert.equal((await post("/api/marketing/save", { actorId: masterEmail, article: {} }, session)).status, 403);
  await db.insertInto("business_managers").values({ account_id: member }).execute();
  assert.equal((await post("/api/marketing/save", { article: {} }, session, { Origin: "https://evil.example" })).status, 403);
  assert.equal((await post("/api/marketing/save", { article: {} }, session, { "X-CSRF-Token": "invalid" })).status, 403);
  assert.equal((await post("/api/marketing/save", { article: {} }, session)).status, 400);
});

test("public visitors use separate HttpOnly cookies and cannot submit cross-origin or oversized forms", async () => {
  const visitor = await page("/apply"); assert.equal(visitor.response.status, 200); assert.ok(visitor.cookie.includes("ebs-sales-visitor=")); assert.match(visitor.response.headers.getSetCookie()[0]!, /HttpOnly; SameSite=Lax/);
  assert.equal((await post("/api/sales/apply", {}, visitor, { Origin: "https://evil.example" })).status, 403);
  assert.equal((await post("/api/sales/apply", { name: "x".repeat(33000) }, visitor)).status, 400);
  const other = await page("/free-value");
  const identified = await post("/api/sales/identify", { name: "HTTP signup", email: `public-${randomUUID()}@example.test`, subscribe: true }, visitor); assert.equal(identified.status, 200);
  const snapshot = await fetch(app.origin + "/api/sales/snapshot?page=free-value", { headers: { Cookie: other.cookie } }); const result = await snapshot.json() as { value: { identified: boolean } }; assert.equal(result.value.identified, false);
  // Only these test-owned visitor rows are removed; the shared suite's leads remain.
  const first = await identified.json() as { value: { identified: boolean } }; assert.equal(first.value.identified, true);
  const emails = await db.selectFrom("sales_leads").select("visitor_id").where("name", "=", "HTTP signup").where("email", "like", "public-%@example.test").execute();
  if (emails.length) await db.deleteFrom("sales_visitors").where("id", "in", emails.map(e => e.visitor_id)).execute();
});

test("member HTTP messages ignore spoofed client and mentor fields and preserve the weekly gate", async () => {
  const client = await account(), other = await account(), session = await signed(client);
  await db.insertInto("coaching_memberships").values({ client_id: client, level: "individual", active: true }).execute();
  const sent = await post("/api/client/coaching/messages/send", { requestId: randomUUID(), body: "Own conversation", clientId: other, actorId: other, mentor: true }, session); assert.equal(sent.status, 200);
  const row = await db.selectFrom("coaching_messages").selectAll().where("client_id", "=", client).executeTakeFirstOrThrow(); assert.equal(row.sender_id, client); assert.equal(row.from_mentor, false);
  const others = await db.selectFrom("coaching_messages").select("id").where("client_id", "=", other).execute(); assert.equal(others.length, 0);
  const gated = await startTestApp({ checkinsEnabled: true });
  try {
    assert.ok(await createPostgresProfileStore(db).write({ accountId: client, revision: 0, profile: completedProfile() }));
    await db.insertInto("weekly_checkin_schedules").values({ account_id: client, timezone: "UTC", first_week: "2020-01-04" }).execute();
    const response = await fetch(gated.origin + "/api/client/coaching", { headers: { Cookie: session.cookie } }); assert.equal(response.status, 403); assert.match(await response.text(), /checkin_required/);
  } finally { await gated.close(); }
});
