// Run through stdin inside the built image; no test tooling belongs in runtime.
import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { createApplication } from "./src/platform/application.ts";
import { readConfig } from "./src/platform/config.ts";

assert.equal(process.env.NODE_ENV, "production");
assert.notEqual(process.getuid(), 0);
for (const path of [".env", ".data", ".git", "test"]) assert.equal(existsSync(path), false);
await assert.rejects(import("typescript"), { code: "ERR_MODULE_NOT_FOUND" });

const configuration = readConfig({ ...process.env,
  PUBLIC_ORIGIN: "https://container.example.test", AUTH_RATE_KEY: "a".repeat(64),
  EMAIL_MODE: "resend", EMAIL_FROM: "test@example.test", RESEND_API_KEY: "test-only-never-sent",
  ONBOARDING_ENABLED: "true", AUTH_HARRY_PREVIEW: "true",
});
assert.equal(configuration.ok, true);
const app = createApplication(configuration.value);
app.server.listen(0, "127.0.0.1");
await once(app.server, "listening");
try {
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const health = await fetch(`${origin}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
  const signIn = await fetch(`${origin}/sign-in`);
  assert.equal(signIn.status, 200);
  assert.match(await signIn.text(), /Elite Body System/);
  assert.match(signIn.headers.getSetCookie()[0], /^__Host-ebs-csrf=.*HttpOnly.*Secure$/);
  for (const path of ["/assets/app.js", "/assets/app.css"]) {
    const asset = await fetch(`${origin}${path}`);
    assert.equal(asset.status, 200);
    assert.ok((await asset.text()).length > 100);
  }
  for (const path of ["/.env", "/.data/outbox", "/.git/config"]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 404);
    await response.body.cancel();
  }
  assert.equal(existsSync("scripts/onboarding-admin.ts"), true);
  const provisioned = await app.auth.provisionAccount({ email: "harrybaldwin@preview.invalid" }); assert.equal(provisioned.ok, true);
  const preview = await app.auth.signInHarryPreview({ alias: "harrybaldwin", clientKey: "onboarding-production-smoke" }); assert.equal(preview.ok, true);
  const headers = { Cookie: `__Host-ebs-session=${preview.value.sessionToken}` };
  const gated = await fetch(origin, { headers, redirect: "manual" }); assert.equal(gated.status, 303); assert.equal(gated.headers.get("location"), "/onboarding"); await gated.body.cancel();
  const onboarding = await fetch(`${origin}/onboarding`, { headers }); assert.equal(onboarding.status, 200); assert.match(await onboarding.text(), /data-page="onboarding"/);
  const denied = await fetch(`${origin}/api/client/state`, { headers }); assert.equal(denied.status, 403); assert.equal((await denied.json()).error.reason, "onboarding_required");
  console.log("Production image passed: unprivileged runtime, database health, HTTPS cookies, assets, and private paths");
  console.log("Onboarding production image passed: new migrations, admin tooling, authenticated route and API gate");
} finally { await app.close(); }
