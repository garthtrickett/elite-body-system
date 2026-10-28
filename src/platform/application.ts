import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { sql } from "kysely";
import { createAuth, createAuthHttp, createLinkDelivery, createPostgresAuthStore, HARRY_PREVIEW_EMAIL } from "../features/auth/index.ts";
import { createDatabase } from "./database/connection.ts";
import type { Config } from "./config.ts";
import { createClientHttp } from "./client-http.ts";
import { createOnboarding, createS3AssessmentStorage, createGoogleBookingProvider, assessmentUploadOrigin, accountSetupProblem } from "../features/onboarding/index.ts";
import type { AssessmentStorage } from "../features/onboarding/index.ts";
import { createWeeklyCheckins, startCheckinWorker, createMentorCheckins, createMentorSummarizer } from "../features/checkins/index.ts";
import { createMentorHttp } from "./mentor-http.ts";

import { createPublicSales, createSalesManagement } from "../features/sales/index.ts";
import { createDelivery } from "../features/delivery/index.ts";
import { createDeliveryHttp } from "./delivery-http.ts";
import { createMarketing } from "../features/marketing/index.ts";
import { createMarketingHttp } from "./marketing-http.ts";
import { createSalesHttp } from "./sales-http.ts";

export function createApplication(config: Config, dependencies: Readonly<{ assessmentStorage?: AssessmentStorage }> = {}) {
  const db = createDatabase(config.databaseUrl);
  const auth = createAuth({ store: createPostgresAuthStore(db), deliverLink: createLinkDelivery(config.delivery),
    publicOrigin: config.publicOrigin, rateKey: config.rateKey, harryPreview: config.harryPreview === true });
  const management = createSalesManagement({ db });
  const marketing = createMarketing({ db, ...(config.marketingProviderRpm ? { requestsPerMinute: config.marketingProviderRpm } : {}), ...(config.openAiApiKey ? { openAiApiKey: config.openAiApiKey } : {}), ...(config.youtubeApiKey ? { youtubeApiKey: config.youtubeApiKey } : {}) });
  const handleMarketing = createMarketingHttp({ auth, publicOrigin: config.publicOrigin, marketing });
  const handleSales = createSalesHttp({ auth, publicOrigin: config.publicOrigin, publicSales: createPublicSales({ db }), management });
  const onboarding = createOnboarding({ db });
  const mentorCheckins = createMentorCheckins({ db, summarizer: createMentorSummarizer({ ...(config.openAiApiKey ? { apiKey: config.openAiApiKey } : {}) }) });
  const delivery = createDelivery({ db, checkins: mentorCheckins, auth });
  const handleDelivery = createDeliveryHttp({ auth, publicOrigin: config.publicOrigin, delivery });
  const handleMentor = createMentorHttp({ auth, publicOrigin: config.publicOrigin, checkins: mentorCheckins });
  const checkins = createWeeklyCheckins({ db, enabled: config.checkinsEnabled !== false, hour: config.checkinHour ?? 9,
    ...(config.harryPreview && config.delivery.mode === "disabled" ? { previewEmail: HARRY_PREVIEW_EMAIL } : {}), ready: async ({ accountId }) => {
    if (!config.onboardingEnabled) return true;
    const result = await onboarding.eligible({ accountId });
    if (!result.ok) throw new Error("Onboarding eligibility unavailable");
    return result.value.eligible;
  } });
  let checkinWorker: ReturnType<typeof startCheckinWorker> | undefined;
  const handle = createAuthHttp({ auth, publicOrigin: config.publicOrigin, ...(config.masterEmail ? { masterEmail: config.masterEmail } : {}), masterPreview: config.harryPreview === true && config.delivery.mode === "disabled", ...(config.assessmentStorage ? { uploadOrigin: assessmentUploadOrigin(config.assessmentStorage) } : {}), pageAccess: async ({ accountId, path }) => {
    if (path.startsWith("/manage") || path === "/master") {
      const access = await management.access({ actorId: accountId });
      return access.ok ? { allowed: access.value.allowed, forbidden: !access.value.allowed } : { allowed: false, unavailable: true };
    }
    if (path === "/mentor/check-ins" || path === "/mentor") {
      const access = await mentorCheckins.access({ actorId: accountId });
      return access.ok ? { allowed: access.value.allowed, forbidden: !access.value.allowed } : { allowed: false, unavailable: true };
    }
    if (path === "/account/media" || path === "/account/setup" || path === "/check-in") return { allowed: true };
    if (path !== "/onboarding") {
      const access = config.onboardingEnabled ? await onboarding.eligible({ accountId }) : { ok: true as const, value: { eligible: true } };
      if (!access.ok) return { allowed: false, unavailable: true };
      if (access.value.eligible) {
        const weekly = await checkins.access({ accountId });
        if (!weekly.ok) return { allowed: false, unavailable: true };
        return weekly.value.required ? { allowed: false, redirect: "/check-in" } : { allowed: true };
      }
    }
    const current = await onboarding.get({ accountId });
    if (!current.ok) return { allowed: false, unavailable: true };
    const setupRequired = !current.value.completedAt && !!accountSetupProblem(current.value.answers.routine);
    return { allowed: path === "/onboarding" && !setupRequired, redirect: setupRequired ? "/account/setup" : "/onboarding" };
  } });
  const handleClient = createClientHttp({ auth, db, checkins, delivery, publicOrigin: config.publicOrigin, onboardingEnabled: config.onboardingEnabled === true,
    ...(config.googleBooking ? { bookingProvider: createGoogleBookingProvider(config.googleBooking) } : {}),
    ...(dependencies.assessmentStorage ? { assessmentStorage: dependencies.assessmentStorage } : config.assessmentStorage ? { assessmentStorage: createS3AssessmentStorage(config.assessmentStorage) } : {}), ...(config.openAiApiKey ? { openAiApiKey: config.openAiApiKey } : {}) });
  const assets = new Map([
    ["/assets/app.js", { file: new URL("../../dist/app.js", import.meta.url), type: "text/javascript; charset=utf-8" }],
    ["/assets/app.css", { file: new URL("../../dist/app.css", import.meta.url), type: "text/css; charset=utf-8" }],
    ["/assets/fonts/instrument-serif-regular.woff2", { file: new URL("../../dist/fonts/instrument-serif-regular.woff2", import.meta.url), type: "font/woff2" }],
    ["/assets/fonts/instrument-serif-italic.woff2", { file: new URL("../../dist/fonts/instrument-serif-italic.woff2", import.meta.url), type: "font/woff2" }],
    ["/assets/fonts/geist.woff2", { file: new URL("../../dist/fonts/geist.woff2", import.meta.url), type: "font/woff2" }],
  ]);
  for (const name of ["band.jpg", "hero.jpg", "portrait.jpg", "logo.png"]) assets.set(`/assets/sales/${name}`, { file: new URL(`../assets/sales/${name}`, import.meta.url), type: name.endsWith("png") ? "image/png" : "image/jpeg" });
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
        response.writeHead(200, { "Content-Type": asset.type, "X-Content-Type-Options": "nosniff", ...(asset.type === "font/woff2" ? { "Access-Control-Allow-Origin": "*" } : {}) });
        response.end(contents); return;
      }
      if (["/free-value", "/apply", "/book-call", "/client-stories"].includes(path) || path.startsWith("/api/sales/") || path.startsWith("/api/management/")) await handleSales(request, response);
      else if (path.startsWith("/api/marketing/")) await handleMarketing(request, response);
      else if (path.startsWith("/api/mentor/delivery/")) await handleDelivery(request, response);
      else if (path.startsWith("/api/mentor/")) await handleMentor(request, response);
      else if (path.startsWith("/api/client/")) await handleClient(request, response);
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
    startBackgroundWork(): void { if (config.checkinsEnabled !== false && !checkinWorker) checkinWorker = startCheckinWorker({ db, checkins }); },
    async close(): Promise<void> {
      await checkinWorker?.stop();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await db.destroy();
    },
  };
}
