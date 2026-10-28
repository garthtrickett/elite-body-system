import { createServer } from "node:net";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createApplication } from "../../src/platform/application.ts";
import type { AssessmentStorage } from "../../src/features/onboarding/index.ts";

export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Tests require an isolated DATABASE_URL. Use bash scripts/with-postgres.sh npm run verify");
  return url;
}

export async function startTestApp(options: Readonly<{ harryPreview?: boolean; previewFlow?: boolean; onboardingEnabled?: boolean; checkinsEnabled?: boolean; assessmentStorage?: AssessmentStorage }> = {}) {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("Port unavailable");
  const port = address.port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const origin = `http://127.0.0.1:${port}`;
  const outbox = await mkdtemp(join(tmpdir(), "elite-body-system-outbox-"));
  const app = createApplication({ databaseUrl: testDatabaseUrl(), publicOrigin: origin,
    rateKey: "a".repeat(64), harryPreview: options.harryPreview === true, onboardingEnabled: options.onboardingEnabled === true, checkinsEnabled: options.checkinsEnabled === true,
    ...(options.assessmentStorage ? { assessmentStorage: { endpoint: "https://uploads.example.test", region: "test", bucket: "test", accessKeyId: "test", secretAccessKey: "test" } } : {}),
    host: "127.0.0.1", port, delivery: options.previewFlow ? { mode: "disabled" } : { mode: "outbox", directory: outbox } }, options.assessmentStorage ? { assessmentStorage: options.assessmentStorage } : {});
  app.server.listen(port, "127.0.0.1");
  await once(app.server, "listening");
  return {
    ...app, origin, outbox,
    async readLink(email: string): Promise<string> {
      for (const file of await readdir(outbox)) {
        const message: unknown = JSON.parse(await readFile(join(outbox, file), "utf8"));
        if (message && typeof message === "object" && "to" in message && "link" in message &&
            message.to === email && typeof message.link === "string") return message.link;
      }
      throw new Error("Test outbox has no matching link");
    },
    async close(): Promise<void> {
      // A browser can leave speculative/incomplete HTTP connections behind even
      // after its page closes. Stop accepting first, then release this test's
      // sockets so teardown does not wait for browser-context fixture disposal.
      const closing = app.close();
      app.server.closeAllConnections();
      await closing;
      await rm(outbox, { recursive: true, force: true });
    },
  };
}
