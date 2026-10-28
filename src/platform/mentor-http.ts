import { createAuthenticatedHttp, json } from "../features/auth/index.ts";
import type { Auth } from "../features/auth/index.ts";
import type { MentorCheckins } from "../features/checkins/index.ts";
import type { ClientResult } from "../shared/client-result.ts";

export function createMentorHttp(config: Readonly<{ auth: Auth; publicOrigin: string; checkins: MentorCheckins }>) {
  return createAuthenticatedHttp({ auth: config.auth, publicOrigin: config.publicOrigin, handle: async ({ account, request, response, body }) => {
    const url = new URL(request.url ?? "/", config.publicOrigin), actorId = account.id;
    const send = (result: ClientResult<unknown>) => json(response, result.ok ? 200 : result.error.code === "forbidden" ? 403 : result.error.code === "not_found" ? 404 : result.error.code === "conflict" ? 409 : result.error.code === "rate_limited" ? 429 : result.error.code === "unavailable" || result.error.code === "not_configured" ? 503 : 400, result);
    if (url.pathname === "/api/mentor/checkins" && request.method === "GET") { send(await config.checkins.queue({ actorId })); return; }
    if (url.pathname === "/api/mentor/checkins/history" && request.method === "GET") { send(await config.checkins.history({ actorId, clientId: url.searchParams.get("clientId"), ...(url.searchParams.has("before") ? { before: url.searchParams.get("before") } : {}) })); return; }
    if (url.pathname === "/api/mentor/checkins/summary" && request.method === "POST") { send(await config.checkins.summary({ actorId, clientId: body.clientId, week: body.week })); return; }
    if (url.pathname === "/api/mentor/checkins/review" && request.method === "POST") { send(await config.checkins.review({ actorId, clientId: body.clientId, week: body.week, revision: body.revision })); return; }
    json(response, 404, { ok: false, error: { code: "not_found", message: "That coach action is unavailable." } });
  } });
}
