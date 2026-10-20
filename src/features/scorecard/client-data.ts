import { isRecord, isRevision, isDay } from "../../shared/validation.ts";
import { parseProfile } from "../profile/browser.ts";
import type { ProfileSnapshot } from "../profile/browser.ts";
import { parseScorecard } from "./operations.ts";
import type { Scorecard } from "./operations.ts";

export type StoredDay = Readonly<{ date: string; scorecard: Scorecard; revision: number }>;
export type ClientState = Readonly<{ profile: ProfileSnapshot; day: StoredDay; history: readonly StoredDay[] }>;

export function parseStoredDay(value: unknown): StoredDay | undefined {
  if (!isRecord(value) || !isDay(value.date) || !isRevision(value.revision)) return undefined;
  const parsed = parseScorecard(value.scorecard);
  return parsed.ok ? { date: value.date, revision: value.revision, scorecard: parsed.value } : undefined;
}
export function parseProfileSnapshot(value: unknown): ProfileSnapshot | undefined {
  if (!isRecord(value) || !isRevision(value.revision)) return undefined;
  const parsed = parseProfile(value.profile);
  return parsed.ok ? { profile: parsed.value, revision: value.revision } : undefined;
}
export function parseClientState(value: unknown): ClientState | undefined {
  if (!isRecord(value) || !Array.isArray(value.history) || value.history.length > 100) return undefined;
  const profile = parseProfileSnapshot(value.profile), day = parseStoredDay(value.day), history = value.history.map(parseStoredDay);
  return profile && day && history.every((item): item is StoredDay => item !== undefined) ? { profile, day, history } : undefined;
}
