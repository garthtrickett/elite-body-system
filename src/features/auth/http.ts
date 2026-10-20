import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { newToken, validToken } from "./operations.ts";
import type { Auth } from "./operations.ts";
import type { AuthFailure } from "./contracts.ts";

const MAX_BODY = 4_096;
function cookie(request: IncomingMessage, name: string): string | undefined {
  const matches = (request.headers.cookie ?? "").split(";").map(part => part.trim())
    .filter(part => part.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0]?.slice(name.length + 1) : undefined;
}

export function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage, limit = MAX_BODY): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    let data = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      size += Buffer.byteLength(chunk);
      if (size > limit) { reject(new Error("Body too large")); return; }
      data += chunk;
    });
    request.on("error", reject);
    request.on("end", () => {
      try {
        const value: unknown = JSON.parse(data);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid body");
        resolve(value as Record<string, unknown>);
      } catch { reject(new Error("Invalid JSON")); }
    });
  });
}

/** Shared authenticated transport: callers never supply the account identity. */
export function createAuthenticatedHttp(config: Readonly<{
  auth: Auth; publicOrigin: string;
  handle: (input: Readonly<{ account: import("./contracts.ts").Account; request: IncomingMessage; response: ServerResponse; body: Readonly<Record<string, unknown>> }>) => Promise<void>;
}>) {
  let inFlight = 0;
  const secure = config.publicOrigin.startsWith("https:");
  const sessionName = secure ? "__Host-ebs-session" : "ebs-session";
  const csrfName = secure ? "__Host-ebs-csrf" : "ebs-csrf";
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const session = await config.auth.resolveSession({ sessionToken: cookie(request, sessionName) });
    if (!session.ok) { json(response, session.error.code === "unavailable" ? 503 : 401, session); return; }
    if (request.method !== "GET" && request.method !== "POST") { json(response, 405, { ok: false, error: { code: "invalid_input" } }); return; }
    if (inFlight >= 8) { json(response, 503, { ok: false, error: { code: "unavailable", message: "Your account is busy. Try again." } }); return; }
    inFlight += 1;
    try {
      let body: Readonly<Record<string, unknown>> = {};
      if (request.method === "POST") {
        const csrf = cookie(request, csrfName), supplied = request.headers["x-csrf-token"];
        if (request.headers.origin !== config.publicOrigin || request.headers["content-type"]?.split(";")[0]?.trim() !== "application/json" ||
            !validToken(csrf) || !validToken(supplied) || !timingSafeEqual(Buffer.from(csrf), Buffer.from(supplied))) {
          json(response, 403, { ok: false, error: { code: "forbidden" } }); return;
        }
        try { body = await readBody(request, new URL(request.url ?? "/", config.publicOrigin).pathname === "/api/client/meals/analyze" ? 6 * 1024 * 1024 : 256 * 1024); }
        catch { json(response, 400, { ok: false, error: { code: "invalid_input" } }); return; }
      }
      await config.handle({ account: session.value, request, response, body });
    } finally { inFlight -= 1; }
  };
}

export function createAuthHttp(config: Readonly<{ auth: Auth; publicOrigin: string }>):
  (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  const { auth, publicOrigin } = config;
  const secure = publicOrigin.startsWith("https:");
  const names = { session: secure ? "__Host-ebs-session" : "ebs-session", csrf: secure ? "__Host-ebs-csrf" : "ebs-csrf" };
  const setCookie = (name: string, value: string, age: number) =>
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? "; Secure" : ""}`;
  const failure = (response: ServerResponse, status: number, code: AuthFailure["code"]) =>
    json(response, status, { ok: false, error: { code } });
  const sendResult = (response: ServerResponse, result: Awaited<ReturnType<Auth["resolveSession"]>>) =>
    json(response, result.ok ? 200 : result.error.code === "unavailable" ? 503 : 401, result);

  return async (request, response) => {
    const path = new URL(request.url ?? "/", publicOrigin).pathname;
    const sessionToken = cookie(request, names.session);
    if (request.method === "GET" && path === "/api/auth/session") {
      sendResult(response, await auth.resolveSession({ sessionToken }));
      return;
    }
    const signedInPage = ["/", "/training", "/meals", "/mindset/map", "/courses/nutrition", "/courses/activity", "/courses/mindset"].includes(path);
    if (request.method === "GET" && (signedInPage || ["/sign-in", "/sign-in/confirm"].includes(path))) {
      if (signedInPage) {
        const session = await auth.resolveSession({ sessionToken });
        if (!session.ok) {
          if (session.error.code === "unavailable") { failure(response, 503, "unavailable"); return; }
          response.writeHead(303, { Location: "/sign-in", "Cache-Control": "no-store" }); response.end(); return;
        }
      }
      const existingCsrf = cookie(request, names.csrf);
      const csrf = validToken(existingCsrf) ? existingCsrf : newToken();
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
        "Set-Cookie": setCookie(names.csrf, csrf, 28_800),
        "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src 'self' data:; media-src https:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
      response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="color-scheme" content="${signedInPage ? "dark" : "light"}"><title>Elite Body System</title><link rel="stylesheet" href="/assets/app.css"></head><body><main id="app" data-csrf="${csrf}" data-page="${path === "/training" ? "training" : path === "/meals" ? "meals" : path === "/mindset/map" ? "map" : path.startsWith("/courses/") ? path.slice(9) : "scorecard"}" data-mode="${signedInPage ? "home" : path === "/sign-in/confirm" ? "confirm" : "request"}"></main><noscript>JavaScript is needed to use this interface. Core operations are also available programmatically.</noscript><script type="module" src="/assets/app.js"></script></body></html>`);
      return;
    }
    const actions = ["/api/auth/request-link", "/api/auth/inspect-link", "/api/auth/redeem-link", "/api/auth/sign-out"];
    if (request.method !== "POST" || !actions.includes(path)) { failure(response, 404, "invalid_input"); return; }
    if (request.headers.origin !== publicOrigin || request.headers["content-type"]?.split(";")[0]?.trim() !== "application/json") {
      failure(response, 403, "invalid_input"); return;
    }
    const csrf = cookie(request, names.csrf);
    const supplied = request.headers["x-csrf-token"];
    if (!validToken(csrf) || !validToken(supplied) || !timingSafeEqual(Buffer.from(csrf), Buffer.from(supplied))) {
      failure(response, 403, "invalid_input"); return;
    }
    let body: Record<string, unknown>;
    try { body = await readBody(request); }
    catch { failure(response, 400, "invalid_input"); return; }
    const expected = path.endsWith("request-link") ? "email" : path.endsWith("sign-out") ? "" : "token";
    if (Object.keys(body).sort().join(",") !== expected) { failure(response, 400, "invalid_input"); return; }
    if (path.endsWith("request-link")) {
      const result = await auth.requestLink({ email: body.email, clientKey: request.socket.remoteAddress ?? "unknown" });
      json(response, result.ok ? 200 : 400, result); return;
    }
    if (path.endsWith("inspect-link")) {
      const result = await auth.inspectLink({ token: body.token });
      json(response, result.ok ? 200 : result.error.code === "unavailable" ? 503 : 400, result); return;
    }
    if (path.endsWith("sign-out")) {
      const result = await auth.signOut({ sessionToken });
      if (result.ok) response.setHeader("Set-Cookie", setCookie(names.session, "", 0));
      json(response, result.ok ? 200 : 503, result); return;
    }
    const result = await auth.redeemLink({ token: body.token });
    if (!result.ok) { failure(response, result.error.code === "unavailable" ? 503 : 400, result.error.code); return; }
    response.setHeader("Set-Cookie", [setCookie(names.session, result.value.sessionToken, 28_800), setCookie(names.csrf, "", 0)]);
    // Browser sessions only travel in HttpOnly cookies, never JSON or localStorage.
    json(response, 200, { ok: true, value: result.value.account });
  };
}
