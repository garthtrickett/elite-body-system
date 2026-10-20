import { isRecord } from "./validation.ts";
import type { ClientResult } from "./client-result.ts";

/** Same-origin transport. CSRF and the fetch dependency stay outside feature models. */
export function createClientTransport(config: Readonly<{ csrf: string; send: typeof fetch }>) {
  const send = config.send;
  return async <T>(input: Readonly<{ path: string; body?: unknown; parse: (value: unknown) => T | undefined; timeout?: number }>): Promise<ClientResult<T>> => {
    try {
      const response = await send(input.path, { credentials: "same-origin", redirect: "error", signal: AbortSignal.timeout(input.timeout ?? 15000),
        ...(input.body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": config.csrf }, body: JSON.stringify(input.body) }) });
      const value: unknown = await response.json();
      if (response.ok && isRecord(value) && value.ok === true) { const parsed = input.parse(value.value); if (parsed !== undefined) return { ok: true, value: parsed }; }
      if (response.status === 401) return { ok: false, error: { code: "forbidden", message: "Your session ended. Sign in again to continue." } };
      if (isRecord(value) && value.ok === false && isRecord(value.error) && typeof value.error.message === "string") {
        const code = value.error.code;
        if (code === "invalid_input" || code === "conflict" || code === "unavailable" || code === "not_found" || code === "forbidden" || code === "not_configured" || code === "rate_limited") return { ok: false, error: { code, message: value.error.message } };
      }
    } catch { /* Transport details and secrets never enter the model. */ }
    return { ok: false, error: { code: "unavailable", message: "Could not reach your account. Try again." } };
  };
}
