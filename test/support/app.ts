import { createServer } from "node:net";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createApplication } from "../../src/platform/application.ts";

export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Tests require an isolated DATABASE_URL. Use bash scripts/with-postgres.sh npm run verify");
  return url;
}

export async function startTestApp() {
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
    rateKey: "a".repeat(64), host: "127.0.0.1", port, delivery: { mode: "outbox", directory: outbox } });
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
      await app.close();
      await rm(outbox, { recursive: true, force: true });
    },
  };
}
