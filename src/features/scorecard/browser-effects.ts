import { routeDelay } from "../../shared/browser-delay.ts";
import { createClientTransport } from "../../shared/browser-http.ts";
import { parseClientState, parseProfileSnapshot, parseStoredDay } from "./client-data.ts";
import type { SyncEffect, SyncProposal } from "./browser-sync.ts";

export function createScorecardEffects(config: Readonly<{ csrf: string; send: typeof fetch; signal?: AbortSignal }>) {
  const call = createClientTransport(config);
  return async (effect: SyncEffect): Promise<SyncProposal> => {
    if (effect.kind === "load") return { kind: "clientLoaded", id: effect.id, result: await call({ path: "/api/client/state", parse: parseClientState }) };
    if (effect.kind === "saveProfile") return { kind: "profileSaved", id: effect.id, result: await call({ path: "/api/client/profile", body: { revision: effect.revision, profile: effect.profile }, parse: parseProfileSnapshot }) };
    // Coalesce rapid typing without placing timers or HTTP calls inside acceptance.
    await routeDelay(250, config.signal);
    return { kind: "daySaved", id: effect.id, result: await call({ path: "/api/client/day", body: { date: effect.date, revision: effect.revision, scorecard: effect.scorecard }, parse: parseStoredDay }) };
  };
}
