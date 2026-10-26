import { createAuthenticatedHttp, json } from "../features/auth/index.ts";
import type { Auth } from "../features/auth/index.ts";
import { createProfiles, createPostgresProfileStore, clientDay } from "../features/profile/index.ts";
import type { ClientResult } from "../features/profile/index.ts";
import { createScorecards, parseScorecard } from "../features/scorecard/index.ts";
import type { Kysely } from "kysely";
import type Database from "./database/generated/Database.ts";
import { createTraining, trainingComplete } from "../features/training/index.ts";
import { createLearning } from "../features/learning/index.ts";
import { createContentMedia } from "../features/content/index.ts";
import { createMeals, createOpenAiMealAnalyzer } from "../features/meals/index.ts";
import { createOnboarding, createAssessmentMedia, createMarketingPermissions } from "../features/onboarding/index.ts";
import type { AssessmentStorage, BookingProvider } from "../features/onboarding/index.ts";

export function createClientHttp(config: Readonly<{ auth: Auth; db: Kysely<Database>; publicOrigin: string; openAiApiKey?: string; onboardingEnabled?: boolean; assessmentStorage?: AssessmentStorage; bookingProvider?: BookingProvider }>) {
  const onboarding = createOnboarding({ db: config.db });
  const marketing = createMarketingPermissions({ db: config.db });
  const assessmentMedia = createAssessmentMedia({ db: config.db, ...(config.assessmentStorage ? { storage: config.assessmentStorage } : {}) });
  const profiles = createProfiles({ store: createPostgresProfileStore(config.db) });
  const scorecards = createScorecards(config.db);
  const training = createTraining({ db: config.db, profiles });
  const learning = createLearning({ db: config.db, profiles, media: createContentMedia(config.db) });
  const meals = createMeals({ db: config.db, profiles, analyzer: createOpenAiMealAnalyzer({ ...(config.openAiApiKey ? { apiKey: config.openAiApiKey } : {}) }) });
  return createAuthenticatedHttp({ auth: config.auth, publicOrigin: config.publicOrigin, handle: async ({ account, request, response, body }) => {
    const url = new URL(request.url ?? "/", config.publicOrigin);
    function send(result: ClientResult<unknown>): void {
      const status = result.ok ? 200 : result.error.code === "conflict" ? 409 : result.error.code === "unavailable" || result.error.code === "not_configured" ? 503 : result.error.code === "rate_limited" ? 429 : result.error.code === "not_found" ? 404 : result.error.code === "forbidden" ? 403 : 400;
      json(response, status, result);
    }
    if (url.pathname === "/api/client/onboarding" && request.method === "GET") { send(await onboarding.get({ accountId: account.id })); return; }
    if (url.pathname === "/api/client/onboarding/document" && request.method === "GET") {
      const result = await onboarding.documentCopy({ accountId: account.id, kind: url.searchParams.get("kind") });
      if (!result.ok) { send(result); return; }
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${result.value.fileName}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      response.end(result.value.text); return;
    }
    if (url.pathname === "/api/client/onboarding/account" && request.method === "POST") { send(await onboarding.saveAccountSetup({ accountId: account.id, revision: body.revision, contentVersion: body.contentVersion, name: body.name, timezone: body.timezone })); return; }
    if (url.pathname === "/api/client/onboarding/marketing" && request.method === "POST") { send(await marketing.save({ accountId: account.id, revision: body.revision, permission: body.permission })); return; }
    if (url.pathname === "/api/client/onboarding/booking/refresh" && request.method === "POST") {
      if (!config.bookingProvider) { send({ ok: false, error: { code: "not_configured", message: "Booking confirmation is not connected yet. Contact Harry after booking." } }); return; }
      const current = await onboarding.get({ accountId: account.id }); if (!current.ok) { send(current); return; }
      const verified = await config.bookingProvider.find({ accountId: account.id, previous: current.value.booking });
      if (!verified.ok) { send(verified); return; }
      send(verified.value ? await onboarding.recordBooking({ accountId: account.id, booking: verified.value }) : current); return;
    }
    if (url.pathname === "/api/client/onboarding/save" && request.method === "POST") { send(await onboarding.save({ accountId: account.id, revision: body.revision, contentVersion: body.contentVersion, answers: body.answers })); return; }
    if (url.pathname === "/api/client/onboarding/complete" && request.method === "POST") {
      if (config.bookingProvider) {
        const current = await onboarding.get({ accountId: account.id }); if (!current.ok) { send(current); return; }
        const verified = await config.bookingProvider.find({ accountId: account.id, previous: current.value.booking });
        if (!verified.ok) { send(verified); return; }
        if (!verified.value) { send({ ok: false, error: { code: "invalid_input", message: "A confirmed onboarding booking is required." } }); return; }
        const recorded = await onboarding.recordBooking({ accountId: account.id, booking: verified.value }); if (!recorded.ok) { send(recorded); return; }
      }
      send(await onboarding.complete({ accountId: account.id, revision: body.revision })); return;
    }
    if (url.pathname === "/api/client/onboarding/media/request" && request.method === "POST") { send(await assessmentMedia.request({ accountId: account.id, slot: body.slot, mediaType: body.mediaType, size: body.size })); return; }
    if (url.pathname === "/api/client/onboarding/media/finalize" && request.method === "POST") { send(await assessmentMedia.finalize({ accountId: account.id, id: body.id })); return; }
    if (url.pathname === "/api/client/onboarding/media/remove" && request.method === "POST") { send(await assessmentMedia.remove({ accountId: account.id, id: body.id })); return; }
    if (url.pathname === "/api/client/onboarding/media/read" && request.method === "POST") { send(await assessmentMedia.read({ accountId: account.id, id: body.id })); return; }
    if (config.onboardingEnabled) {
      const access = await onboarding.eligible({ accountId: account.id });
      if (!access.ok) { send(access); return; }
      if (!access.value.eligible) { json(response, 403, { ok: false, error: { code: "forbidden", reason: "onboarding_required", message: "Complete onboarding before opening your dashboard.", redirect: "/onboarding" } }); return; }
    }
    if (request.method === "GET" && url.pathname === "/api/client/state") {
      const profile = await profiles.get({ accountId: account.id });
      if (!profile.ok) { send(profile); return; }
      const date = url.searchParams.get("day") ?? clientDay({ timezone: profile.value.profile.timezone, now: new Date() });
      const [day, history, session, mapRead, storyNotice] = await Promise.all([scorecards.get({ accountId: account.id, date }), scorecards.history({ accountId: account.id }), training.get({ accountId: account.id, date }), learning.hasRead({ accountId: account.id, date }), marketing.notice({ accountId: account.id })]);
      if (!day.ok) { send(day); return; }
      if (!history.ok) { send(history); return; }
      if (!session.ok) { send(session); return; }
      if (!mapRead.ok) { send(mapRead); return; }
      const complete = trainingComplete(session.value);
      send({ ok: true, value: { profile: profile.value, day: { ...day.value, scorecard: { ...day.value.scorecard, checks: { ...day.value.scorecard.checks, training: complete, map: mapRead.value } } }, history: history.value, storyInvitation: storyNotice.ok && storyNotice.value.pending } }); return;
    }
    if (request.method === "POST" && url.pathname === "/api/client/profile") {
      send(await profiles.save({ accountId: account.id, revision: body.revision, profile: body.profile })); return;
    }
    if (request.method === "GET" && url.pathname === "/api/client/meals") { send(await meals.get({ accountId: account.id, date: url.searchParams.get("date") ?? undefined })); return; }
    if (request.method === "POST" && url.pathname === "/api/client/meals/analyze") { send(await meals.analyze({ accountId: account.id, meal: body })); return; }
    if (request.method === "POST" && url.pathname === "/api/client/meals/log") { send(await meals.log({ accountId: account.id, date: body.date, requestId: body.requestId, meal: body.meal, favorite: body.favorite })); return; }
    if (request.method === "POST" && url.pathname === "/api/client/meals/remove") { send(await meals.remove({ accountId: account.id, id: body.id, date: body.date })); return; }
    if (request.method === "POST" && url.pathname === "/api/client/meals/remove-favorite") { send(await meals.removeFavorite({ accountId: account.id, id: body.id, date: body.date })); return; }
    if (url.pathname === "/api/client/training") {
      if (request.method === "GET") {
        const date = url.searchParams.get("date");
        send(await training.get({ accountId: account.id, ...(date ? { date } : {}) }));
      } else if (body.finish !== undefined && typeof body.finish !== "boolean") send({ ok: false, error: { code: "invalid_input", message: "Invalid workout action." } });
      else send(await training.save({ accountId: account.id, revision: body.revision, workout: body.workout, finish: body.finish === true }));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/client/learning") { send(await learning.get({ accountId: account.id })); return; }
    if (request.method === "POST" && url.pathname === "/api/client/learning/map") {
      if (body.finish !== undefined && typeof body.finish !== "boolean") send({ ok: false, error: { code: "invalid_input", message: "Invalid Map action." } });
      else send(await learning.saveMap({ accountId: account.id, revision: body.revision, map: body.map, finish: body.finish === true })); return;
    }
    if (request.method === "POST" && url.pathname === "/api/client/learning/read-map") { send(await learning.readMap({ accountId: account.id })); return; }
    if (request.method === "POST" && url.pathname === "/api/client/learning/episode") {
      if (typeof body.complete !== "boolean") send({ ok: false, error: { code: "invalid_input", message: "Invalid lesson action." } });
      else send(await learning.saveEpisode({ accountId: account.id, id: body.id, answers: body.answers, revision: body.revision, complete: body.complete })); return;
    }
    if (request.method === "POST" && url.pathname === "/api/client/day") {
      const parsed = parseScorecard(body.scorecard);
      if (!parsed.ok) { send(parsed); return; }
      const session = await training.get({ accountId: account.id, ...(typeof body.date === "string" ? { date: body.date } : {}) });
      if (!session.ok) { send(session); return; }
      const mapRead = await learning.hasRead({ accountId: account.id, date: typeof body.date === "string" ? body.date : "" });
      if (!mapRead.ok) { send(mapRead); return; }
      const complete = trainingComplete(session.value);
      send(await scorecards.save({ accountId: account.id, date: body.date, revision: body.revision,
        scorecard: { ...parsed.value, checks: { ...parsed.value.checks, training: complete, map: mapRead.value } } })); return;
    }
    json(response, 404, { ok: false, error: { code: "not_found" } });
  } });
}
