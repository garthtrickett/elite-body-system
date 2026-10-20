import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createAuthHttp } from "../src/features/auth/index.ts";
import { createApplication } from "../src/platform/application.ts";
import { startTestApp } from "./support/app.ts";

let app: Awaited<ReturnType<typeof startTestApp>>;
before(async () => { app = await startTestApp(); });
after(async () => { await app.close(); });

async function page(path = "/sign-in") {
  const response = await fetch(`${app.origin}${path}`, { redirect: "manual" });
  const body = await response.text();
  const csrf = body.match(/data-csrf="([A-Za-z0-9_-]+)"/)?.[1];
  const cookie = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  return { response, body, csrf, cookie };
}
async function post(path: string, input: unknown, session: Awaited<ReturnType<typeof page>>, extra: Record<string, string> = {}) {
  return fetch(`${app.origin}/api/auth/${path}`, { method: "POST", redirect: "manual",
    headers: { Origin: app.origin, "Content-Type": "application/json", Cookie: session.cookie,
      "X-CSRF-Token": session.csrf ?? "", ...extra }, body: JSON.stringify(input) });
}

test("health checks database reachability without cookies or cached responses", async () => {
  const response = await fetch(`${app.origin}/health`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.deepEqual(await response.json(), { ok: true });
});

test("health fails closed when PostgreSQL is unavailable without disclosing configuration", async () => {
  const unavailable = createApplication({
    databaseUrl: "postgresql://health:must-not-leak@127.0.0.1:1/health",
    publicOrigin: "http://127.0.0.1:3000", host: "127.0.0.1", port: 3000,
    rateKey: "a".repeat(64), delivery: { mode: "outbox", directory: app.outbox },
  });
  unavailable.server.listen(0, "127.0.0.1");
  await once(unavailable.server, "listening");
  try {
    const address = unavailable.server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { ok: false, error: { code: "unavailable" } });
  } finally { await unavailable.close(); }
});

test("unauthenticated home redirects; sign-in has restrictive headers and Tailwind assets", async () => {
  const home = await page("/");
  assert.equal(home.response.status, 303);
  assert.equal(home.response.headers.get("location"), "/sign-in");
  const signIn = await page();
  assert.ok(signIn.csrf);
  assert.match(signIn.response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.equal(signIn.response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(signIn.response.headers.get("cache-control"), "no-store");
  assert.match(signIn.response.headers.getSetCookie()[0] ?? "", /HttpOnly; SameSite=Lax/);
  const css = await fetch(`${app.origin}/assets/app.css`);
  assert.equal(css.status, 200);
  assert.match(await css.text(), /tailwindcss/);
  assert.equal((await fetch(`${app.origin}/.env`)).status, 404);
  assert.equal((await fetch(`${app.origin}/.data/outbox`)).status, 404);
});

test("state changes require same origin, JSON, and valid CSRF; private operations have no public route", async () => {
  const session = await page();
  const input = { email: "unknown@example.test" };
  for (const overrides of [
    { Origin: "https://evil.test" }, { Origin: "" }, { "X-CSRF-Token": "invalid" }, { Cookie: "" },
    { "Content-Type": "text/plain" },
  ]) assert.equal((await post("request-link", input, session, overrides)).status, 403);
  assert.equal((await post("request-link", { ...input, admin: true }, session)).status, 400);
  assert.equal((await post("request-link", [], session)).status, 400);
  assert.equal((await post("request-link", { email: "a".repeat(5_000) }, session)).status, 400);
  assert.equal((await post("provision-account", input, session)).status, 404);
  assert.equal((await fetch(`${app.origin}/api/auth/sign-out`)).status, 404);
});

test("full HTTP flow uses explicit POST redemption, HttpOnly session cookies and revocation", async () => {
  const email = "http-member@example.test";
  assert.equal((await app.auth.provisionAccount({ email })).ok, true);
  const initial = await page();
  const response = await post("request-link", { email }, initial);
  assert.equal(response.status, 200);
  const link = await app.readLink(email);
  const token = new URL(link).hash.slice(1);
  const confirmation = await page("/sign-in/confirm");
  assert.equal((await app.auth.inspectLink({ token })).ok, true);
  assert.equal((await app.auth.inspectLink({ token })).ok, true);
  const inspected = await post("inspect-link", { token }, confirmation);
  assert.equal(inspected.status, 200);
  const redeemed = await post("redeem-link", { token }, confirmation);
  assert.equal(redeemed.status, 200);
  const body = await redeemed.text();
  assert.equal(body.includes("sessionToken"), false);
  const cookies = redeemed.headers.getSetCookie();
  const sessionCookie = cookies.find(value => value.startsWith("ebs-session="));
  assert.ok(sessionCookie);
  assert.match(sessionCookie, /HttpOnly; SameSite=Lax; Max-Age=28800/);
  const cookie = sessionCookie.split(";")[0]!;
  assert.equal((await fetch(`${app.origin}/api/auth/session`, { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await post("redeem-link", { token }, confirmation)).status, 400);
  const home = await fetch(app.origin, { headers: { Cookie: cookie } });
  assert.equal(home.status, 200);
  const html = await home.text();
  const csrf = html.match(/data-csrf="([A-Za-z0-9_-]+)"/)?.[1];
  const csrfCookie = home.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  const signedOut = await post("sign-out", {}, { ...initial, cookie: `${cookie}; ${csrfCookie}`, csrf });
  assert.equal(signedOut.status, 200);
  assert.match(signedOut.headers.getSetCookie()[0] ?? "", /Max-Age=0/);
  assert.equal((await fetch(`${app.origin}/api/auth/session`, { headers: { Cookie: cookie } })).status, 401);
});

test("HTTPS uses Secure __Host cookies", async () => {
  const handle = createAuthHttp({ auth: app.auth, publicOrigin: "https://example.test" });
  const server = createServer((request, response) => { void handle(request, response); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/sign-in`);
    await response.text();
    assert.match(response.headers.getSetCookie()[0] ?? "", /^__Host-ebs-csrf=.*Path=\/; HttpOnly; SameSite=Lax; Max-Age=28800; Secure$/);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
