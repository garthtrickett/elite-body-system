import type { Account, AuthFailure, AuthResult, LinkAcknowledgement } from "./contracts.ts";
import { LINK_ACKNOWLEDGEMENT } from "./contracts.ts";
import type { AuthUiEffect, AuthUiProposal } from "./browser-model.ts";

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function isAccount(value: unknown): value is Account {
  return record(value) && typeof value.id === "string" && typeof value.email === "string";
}
function isFailure(value: unknown): value is AuthFailure {
  return record(value) && typeof value.code === "string" &&
    ["invalid_input", "invalid_link", "unauthenticated", "unavailable"].includes(value.code);
}

export function createAuthUiEffects(config: Readonly<{
  csrf: string; token: string; send: typeof fetch; navigate: (to: string) => void;
}>): (effect: AuthUiEffect) => Promise<AuthUiProposal | undefined> {
  // Call as a function: invoking native browser fetch as config.send gives it
  // the config object as its receiver and causes an Illegal invocation error.
  const send = config.send;
  async function call<T>(path: string, input: unknown, validate: (value: unknown) => value is T): Promise<AuthResult<T>> {
    try {
      const response = await send(path, {
        credentials: "same-origin", redirect: "error", signal: AbortSignal.timeout(10_000),
        ...(input === undefined ? {} : { method: "POST", headers: {
          "Content-Type": "application/json", "X-CSRF-Token": config.csrf,
        }, body: JSON.stringify(input) }),
      });
      const body: unknown = await response.json();
      if (record(body) && body.ok === true && response.ok && validate(body.value)) return { ok: true, value: body.value };
      if (record(body) && body.ok === false && isFailure(body.error)) return { ok: false, error: body.error };
    } catch { /* Untrusted transport failures become typed proposals. */ }
    return { ok: false, error: { code: "unavailable" } };
  }
  return async effect => {
    switch (effect.kind) {
      case "request": return { kind: "requestCompleted", id: effect.id, result: await call("/api/auth/request-link", { email: effect.email },
        (value): value is LinkAcknowledgement => record(value) && value.message === LINK_ACKNOWLEDGEMENT) };
      case "harryPreview": return { kind: "previewCompleted", id: effect.id, result: await call("/api/auth/harry-preview", { alias: "harrybaldwin" }, isAccount) };
      case "inspect": return { kind: "inspectionCompleted", id: effect.id,
        result: await call("/api/auth/inspect-link", { token: config.token }, isAccount) };
      case "redeem": return { kind: "redemptionCompleted", id: effect.id,
        result: await call("/api/auth/redeem-link", { token: config.token }, isAccount) };
      case "session": return { kind: "sessionCompleted", id: effect.id,
        result: await call("/api/auth/session", undefined, isAccount) };
      case "signOut": return { kind: "signOutCompleted", id: effect.id, result: await call("/api/auth/sign-out", {},
        (value): value is Readonly<{ signedOut: true }> => record(value) && value.signedOut === true) };
      case "navigate": config.navigate(effect.to); return undefined;
    }
  };
}
