import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { sql } from "kysely";
import { createAuth, createAuthHttp, createLinkDelivery, createPostgresAuthStore } from "../features/auth/index.ts";
import { createDatabase } from "./database/connection.ts";
import type { Config } from "./config.ts";
import { createClientHttp } from "./client-http.ts";
import { createOnboarding, createS3AssessmentStorage, createGoogleBookingProvider, assessmentUploadOrigin, accountSetupProblem } from "../features/onboarding/index.ts";
import type { AssessmentStorage } from "../features/onboarding/index.ts";

export function createApplication(config: Config, dependencies: Readonly<{ assessmentStorage?: AssessmentStorage }> = {}) {
  const db = createDatabase(config.databaseUrl);
  const auth = createAuth({ store: createPostgresAuthStore(db), deliverLink: createLinkDelivery(config.delivery),
    publicOrigin: config.publicOrigin, rateKey: config.rateKey, harryPreview: config.harryPreview === true });
  const onboarding = createOnboarding({ db });
  const handle = createAuthHttp({ auth, publicOrigin: config.publicOrigin, ...(config.assessmentStorage ? { uploadOrigin: assessmentUploadOrigin(config.assessmentStorage) } : {}), pageAccess: async ({ accountId, path }) => {
    if (path === "/account/media" || path === "/account/setup") return { allowed: true };
    if (path !== "/onboarding") {
      if (!config.onboardingEnabled) return { allowed: true };
      const access = await onboarding.eligible({ accountId });
      if (!access.ok) return { allowed: false, unavailable: true };
      if (access.value.eligible) return { allowed: true };
    }
    const current = await onboarding.get({ accountId });
    if (!current.ok) return { allowed: false, unavailable: true };
    const setupRequired = !current.value.completedAt && !!accountSetupProblem(current.value.answers.routine);
    return { allowed: path === "/onboarding" && !setupRequired, redirect: setupRequired ? "/account/setup" : "/onboarding" };
  } });
  const handleClient = createClientHttp({ auth, db, publicOrigin: config.publicOrigin, onboardingEnabled: config.onboardingEnabled === true,
    ...(config.googleBooking ? { bookingProvider: createGoogleBookingProvider(config.googleBooking) } : {}),
    ...(dependencies.assessmentStorage ? { assessmentStorage: dependencies.assessmentStorage } : config.assessmentStorage ? { assessmentStorage: createS3AssessmentStorage(config.assessmentStorage) } : {}), ...(config.openAiApiKey ? { openAiApiKey: config.openAiApiKey } : {}) });
  const assets = new Map([
    ["/assets/app.js", { file: new URL("../../dist/app.js", import.meta.url), type: "text/javascript; charset=utf-8" }],
    ["/assets/app.css", { file: new URL("../../dist/app.css", import.meta.url), type: "text/css; charset=utf-8" }],
    ["/assets/fonts/instrument-serif-regular.woff2", { file: new URL("../../dist/fonts/instrument-serif-regular.woff2", import.meta.url), type: "font/woff2" }],
    ["/assets/fonts/instrument-serif-italic.woff2", { file: new URL("../../dist/fonts/instrument-serif-italic.woff2", import.meta.url), type: "font/woff2" }],
    ["/assets/fonts/geist.woff2", { file: new URL("../../dist/fonts/geist.woff2", import.meta.url), type: "font/woff2" }],
  ]);
  const server = createServer((request, response) => {
    async function route(): Promise<void> {
      const path = new URL(request.url ?? "/", config.publicOrigin).pathname;
      if (request.method === "GET" && path === "/health") {
        await sql`select 1`.execute(db);
        response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        response.end(JSON.stringify({ ok: true })); return;
      }
      const asset = assets.get(path);
      if (request.method === "GET" && asset) {
        const contents = await readFile(asset.file);
        response.writeHead(200, { "Content-Type": asset.type, "X-Content-Type-Options": "nosniff" });
        response.end(contents); return;
      }
      if (path.startsWith("/api/client/")) await handleClient(request, response);
      else await handle(request, response);
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
