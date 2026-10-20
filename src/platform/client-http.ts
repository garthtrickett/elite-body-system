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

export function createClientHttp(config: Readonly<{ auth: Auth; db: Kysely<Database>; publicOrigin: string; openAiApiKey?: string }>) {
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
    if (request.method === "GET" && url.pathname === "/api/client/state") {
      const profile = await profiles.get({ accountId: account.id });
      if (!profile.ok) { send(profile); return; }
      const date = url.searchParams.get("day") ?? clientDay({ timezone: profile.value.profile.timezone, now: new Date() });
      const [day, history, session, mapRead] = await Promise.all([scorecards.get({ accountId: account.id, date }), scorecards.history({ accountId: account.id }), training.get({ accountId: account.id, date }), learning.hasRead({ accountId: account.id, date })]);
      if (!day.ok) { send(day); return; }
      if (!history.ok) { send(history); return; }
      if (!session.ok) { send(session); return; }
      if (!mapRead.ok) { send(mapRead); return; }
      const complete = trainingComplete(session.value);
      send({ ok: true, value: { profile: profile.value, day: { ...day.value, scorecard: { ...day.value.scorecard, checks: { ...day.value.scorecard.checks, training: complete, map: mapRead.value } } }, history: history.value } }); return;
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
