import { createAuthenticatedHttp, json } from "../features/auth/index.ts";
import type { Auth } from "../features/auth/index.ts";
import type { Marketing } from "../features/marketing/index.ts";
import type { ClientResult } from "../shared/client-result.ts";

export function createMarketingHttp(config: Readonly<{ auth: Auth; publicOrigin: string; marketing: Marketing }>) {
  return createAuthenticatedHttp({ auth: config.auth, publicOrigin: config.publicOrigin, handle: async ({ account, request, response, body }) => {
    const path = new URL(request.url ?? "/", config.publicOrigin).pathname, actorId = account.id;
    const send = (result: ClientResult<unknown>) => json(response, result.ok ? 200 : result.error.code === "forbidden" ? 403 : result.error.code === "conflict" ? 409 : result.error.code === "rate_limited" ? 429 : result.error.code === "unavailable" || result.error.code === "not_configured" ? 503 : 400, result);
    if (request.method === "GET" && path === "/api/marketing/snapshot") { send(await config.marketing.get({ actorId, before: new URL(request.url ?? "/",config.publicOrigin).searchParams.get("before") })); return; }
    if (request.method === "POST" && path === "/api/marketing/save") { send(await config.marketing.save({ actorId, article: body.article, build: body.build === true })); return; }
    if (request.method === "POST" && path === "/api/marketing/research") { send(await config.marketing.research({ actorId, query: body.query })); return; }
    if (request.method === "POST" && path === "/api/marketing/voice") { send(await config.marketing.voice({ actorId, base64: body.base64, mediaType: body.mediaType })); return; }
    json(response, 404, { ok: false, error: { code: "not_found", message: "That marketing action is unavailable." } });
  } });
}
