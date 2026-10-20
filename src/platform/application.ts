import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createAuth, createAuthHttp, createLinkDelivery, createPostgresAuthStore } from "../features/auth/index.ts";
import { createDatabase } from "./database/connection.ts";
import type { Config } from "./config.ts";

export function createApplication(config: Config) {
  const db = createDatabase(config.databaseUrl);
  const auth = createAuth({ store: createPostgresAuthStore(db), deliverLink: createLinkDelivery(config.delivery),
    publicOrigin: config.publicOrigin, rateKey: config.rateKey });
  const handle = createAuthHttp({ auth, publicOrigin: config.publicOrigin });
  const assets = new Map([
    ["/assets/app.js", { file: new URL("../../dist/app.js", import.meta.url), type: "text/javascript; charset=utf-8" }],
    ["/assets/app.css", { file: new URL("../../dist/app.css", import.meta.url), type: "text/css; charset=utf-8" }],
  ]);
  const server = createServer((request, response) => {
    async function route(): Promise<void> {
      const path = new URL(request.url ?? "/", config.publicOrigin).pathname;
      const asset = assets.get(path);
      if (request.method === "GET" && asset) {
        const contents = await readFile(asset.file);
        response.writeHead(200, { "Content-Type": asset.type, "X-Content-Type-Options": "nosniff" });
        response.end(contents); return;
      }
      await handle(request, response);
    }
    void route().catch(() => {
      if (response.headersSent) { response.end(); return; }
      response.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ ok: false, error: { code: "unavailable" } }));
    });
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return {
    auth, server,
    async close(): Promise<void> {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await db.destroy();
    },
  };
}
