import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readdir, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConfig } from "../src/platform/config.ts";
import { createLinkDelivery } from "../src/features/auth/index.ts";
import { checkConventions } from "../scripts/check-conventions.ts";

const env = { DATABASE_URL: "postgresql://postgres@127.0.0.1/example", PUBLIC_ORIGIN: "http://127.0.0.1:3000",
  AUTH_RATE_KEY: "a".repeat(64), EMAIL_MODE: "outbox" };

test("configuration permits local outbox only on loopback and requires HTTPS/email credentials in production", () => {
  assert.equal(readConfig(env).ok, true);
  for (const override of [
    { AUTH_RATE_KEY: "" }, { PUBLIC_ORIGIN: "http://example.test" }, { PUBLIC_ORIGIN: "https://example.test/path" },
    { PUBLIC_ORIGIN: "http://user:password@127.0.0.1:3000" }, { DATABASE_URL: "https://example.test" },
    { HOST: "0.0.0.0" }, { PORT: "NaN" }, { NODE_ENV: "production" }, { EMAIL_MODE: "resend" },
    { PUBLIC_ORIGIN: "https://example.test" },
  ]) assert.equal(readConfig({ ...env, ...override }).ok, false);
  assert.equal(readConfig({ ...env, NODE_ENV: "production", PUBLIC_ORIGIN: "https://example.test",
    EMAIL_MODE: "resend", EMAIL_FROM: "access@example.test", RESEND_API_KEY: "test-placeholder" }).ok, true);
});

test("outbox permissions protect bearer links and provider failures do not leak response bodies", async () => {
  const directory = await mkdtemp(join(tmpdir(), "elite-body-system-delivery-"));
  try {
    const outbox = join(directory, "outbox");
    await createLinkDelivery({ mode: "outbox", directory: outbox })({ email: "member@example.test",
      link: "https://example.test/sign-in/confirm#test", signal: new AbortController().signal });
    assert.equal((await stat(outbox)).mode & 0o777, 0o700);
    const file = join(outbox, (await readdir(outbox))[0]!);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.equal(JSON.parse(await readFile(file, "utf8")).to, "member@example.test");
    const fakeFetch: typeof fetch = async (url, options) => {
      assert.equal(url, "https://api.resend.com/emails");
      assert.equal(options?.method, "POST");
      return new Response("sensitive provider details", { status: 401 });
    };
    await assert.rejects(createLinkDelivery({ mode: "resend", apiKey: "fake", from: "access@example.test" }, fakeFetch)({
      email: "member@example.test", link: "https://example.test/#test", signal: new AbortController().signal,
    }), { message: "Email delivery unavailable" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("convention enforcement detects class expressions and feature-internal imports", async () => {
  const root = await mkdtemp(join(tmpdir(), "elite-body-system-conventions-"));
  try {
    await mkdir(join(root, "features/auth"), { recursive: true });
    await writeFile(join(root, "features/auth/internal.ts"), "export const x = 1;");
    await writeFile(join(root, "caller.ts"), "import { x } from './features/auth/internal.ts'; const C = class {}; let value: any; export { x } from './features/auth/internal.ts'; void import('./features/auth/internal.ts');");
    const issues = await checkConventions(root);
    assert.equal(issues.length, 5);
    assert.ok(issues.some(issue => issue.includes("no application classes")));
    assert.ok(issues.some(issue => issue.includes("public entry points")));
    await writeFile(join(root, "caller.ts"), "import type { Auth } from './features/auth/index.ts';");
    assert.deepEqual(await checkConventions(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
