import { isRecord, isText, isDay } from "../../shared/validation.ts";
import { err, ok } from "../../shared/result.ts";
import type { ClientResult } from "../../shared/client-result.ts";
export type { ClientResult, ClientFailure } from "../../shared/client-result.ts";

export type Targets = Readonly<{ energy: number; protein: number; water: number; sleep: number; steps: number }>;
export const DEFAULT_TARGETS: Targets = { energy: 2000, protein: 150, water: 4, sleep: 8, steps: 8000 };
export const STORY_FIELDS = ["age", "role", "business", "travel", "want", "give", "matters", "never", "tried", "stopped", "now", "why", "almost", "source"] as const;
export type StoryField = typeof STORY_FIELDS[number];
export type ClientProfile = Readonly<{
  name: string; timezone: string; startDate: string; startingWeight: number | undefined;
  trainingDays: readonly number[]; restDay: number; equipment: string; workaround: string; anchor: string; identity: string; firstThought: string; firstGoal: string;
  story: Readonly<Record<StoryField, string>>;
  health: Readonly<{ answers: readonly (boolean | null)[]; details: string; clearance: boolean }>;
  emergency: Readonly<{ name: string; phone: string }>;
  consent: Readonly<{ signedName: string; accepted: boolean; healthData: boolean; adult: boolean; version: "draft-v1"; signedAt: string | undefined }>;
  completed: boolean; setupStep: number; targets: Targets;
}>;
export type ProfileSnapshot = Readonly<{ profile: ClientProfile; revision: number }>;

export function emptyProfile(): ClientProfile {
  return { name: "", timezone: "UTC", startDate: new Date().toISOString().slice(0, 10), startingWeight: undefined,
    trainingDays: [1, 2, 4, 5], restDay: 0, equipment: "", workaround: "", anchor: "", identity: "", firstThought: "", firstGoal: "",
    story: { age: "", role: "", business: "", travel: "", want: "", give: "", matters: "", never: "", tried: "", stopped: "", now: "", why: "", almost: "", source: "" },
    health: { answers: [null, null, null, null, null, null, null], details: "", clearance: false },
    emergency: { name: "", phone: "" }, consent: { signedName: "", accepted: false, healthData: false, adult: false, version: "draft-v1", signedAt: undefined },
    completed: false, setupStep: 0, targets: DEFAULT_TARGETS };
}

export const TARGET_BOUNDS = { energy: [500, 10000], protein: [10, 1000], water: [0.1, 20], sleep: [1, 24], steps: [100, 100000] } as const;
export function targetProblem(input: Readonly<{ field: keyof Targets; value: number }>): string {
  const [min, max] = TARGET_BOUNDS[input.field];
  return !Number.isFinite(input.value) || input.value < min || input.value > max || ((input.field === "energy" || input.field === "steps") && !Number.isInteger(input.value))
    ? `Enter ${input.field === "energy" || input.field === "steps" ? "a whole number" : "a number"} between ${min.toLocaleString("en-GB")} and ${max.toLocaleString("en-GB")}.` : "";
}
export function isTargets(value: unknown): value is Targets {
  if (!isRecord(value)) return false;
  return (Object.keys(TARGET_BOUNDS) as (keyof Targets)[]).every(key => typeof value[key] === "number" && !targetProblem({ field: key, value: value[key] }));
}

export function parseProfile(value: unknown): ClientResult<ClientProfile> {
  const fail = () => err({ code: "invalid_input", message: "Check your profile fields, training days, health answers and targets." } as const);
  if (!isRecord(value) || !isText(value.name, 100) || !isText(value.timezone, 100) || !isDay(value.startDate) ||
      (value.startingWeight !== undefined && value.startingWeight !== null && (typeof value.startingWeight !== "number" || !Number.isFinite(value.startingWeight) || value.startingWeight < 30 || value.startingWeight > 300)) ||
      !Array.isArray(value.trainingDays) || value.trainingDays.length > 4 || new Set(value.trainingDays).size !== value.trainingDays.length ||
      !value.trainingDays.every(d => Number.isInteger(d) && d >= 0 && d <= 6) || typeof value.restDay !== "number" || !Number.isInteger(value.restDay) || value.restDay < 0 || value.restDay > 6 ||
      !isText(value.equipment) || !isText(value.workaround) || !isText(value.anchor, 200) || !isText(value.identity) || !isText(value.firstThought, 5000) || !isText(value.firstGoal, 200) || !isRecord(value.story) ||
      !isRecord(value.health) || !Array.isArray(value.health.answers) || value.health.answers.length !== 7 || !value.health.answers.every(a => a === null || typeof a === "boolean") || !isText(value.health.details) || typeof value.health.clearance !== "boolean" ||
      !isRecord(value.emergency) || !isText(value.emergency.name, 100) || !isText(value.emergency.phone, 50) ||
      !isRecord(value.consent) || !isText(value.consent.signedName, 100) || typeof value.consent.accepted !== "boolean" || typeof value.consent.healthData !== "boolean" || typeof value.consent.adult !== "boolean" || value.consent.version !== "draft-v1" ||
      typeof value.completed !== "boolean" || typeof value.setupStep !== "number" || !Number.isInteger(value.setupStep) || value.setupStep < 0 || value.setupStep > 33 || !isTargets(value.targets)) return fail();
  try { new Intl.DateTimeFormat("en", { timeZone: value.timezone }); } catch { return fail(); }
  const story = Object.fromEntries(STORY_FIELDS.map(key => [key, isRecord(value.story) ? value.story[key] : undefined]));
  if (!STORY_FIELDS.every(key => isText(story[key]))) return fail();
  if (value.completed && (!value.name.trim() || !value.identity.trim() || !value.anchor.trim() || !value.startingWeight || value.trainingDays.length !== 4 || value.trainingDays.includes(value.restDay) || value.health.answers.some(a => a === null) ||
      !value.emergency.name.trim() || value.emergency.phone.replace(/\D/g, "").length < 7 ||
      !value.consent.signedName.trim() || !value.consent.accepted || !value.consent.healthData || !value.consent.adult ||
      (value.health.answers.some(Boolean) && !value.health.details.trim()) ||
      !["want", "give", "matters", "never", "now", "why"].every(key => typeof story[key] === "string" && story[key].trim()))) return fail();
  // Reconstruct rather than trusting extra external properties, including account IDs.
  return ok({ name: value.name.trim(), timezone: value.timezone, startDate: value.startDate, startingWeight: typeof value.startingWeight === "number" ? value.startingWeight : undefined,
    trainingDays: value.trainingDays as number[], restDay: value.restDay, equipment: value.equipment, workaround: value.workaround, anchor: value.anchor, identity: value.identity, firstThought: value.firstThought, firstGoal: value.firstGoal,
    story: story as Record<StoryField, string>, health: { answers: value.health.answers as (boolean | null)[], details: value.health.details, clearance: value.health.clearance },
    emergency: { name: value.emergency.name, phone: value.emergency.phone },
    consent: { signedName: value.consent.signedName, accepted: value.consent.accepted, healthData: value.consent.healthData, adult: value.consent.adult, version: "draft-v1", signedAt: undefined },
    completed: value.completed, setupStep: value.setupStep, targets: { energy: value.targets.energy, protein: value.targets.protein, water: value.targets.water, sleep: value.targets.sleep, steps: value.targets.steps } });
}

export function clientDay(input: Readonly<{ timezone: string; now: Date }>): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: input.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(input.now);
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
