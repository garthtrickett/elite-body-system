import { err, ok } from "../../shared/result.ts";
import type { Result } from "../../shared/result.ts";
import { DEFAULT_TARGETS } from "../profile/browser.ts";
import type { Targets } from "../profile/browser.ts";
import { isRecord, isText } from "../../shared/validation.ts";

export type Metric = "weight" | "energy" | "protein" | "water" | "sleep" | "steps";
export type DailyCheck = "training" | "map" | "focus";
export type Goal = Readonly<{ id: number; text: string; priority: boolean }>;
export type Scorecard = Readonly<{
  values: Readonly<Record<Metric, number | undefined>>;
  checks: Readonly<Record<DailyCheck, boolean>>;
  brainDump: string;
  goals: readonly Goal[];
}>;
export type ScorecardFailure = Readonly<{ code: "invalid_input"; message: string }>;
export type ScorecardResult<T> = Result<T, ScorecardFailure>;

// Default targets and tolerances preserve Harry’s prototype; profiles configure their targets.
export const TARGETS = {
  energy: { target: DEFAULT_TARGETS.energy, tolerance: 100 }, protein: { target: DEFAULT_TARGETS.protein, tolerance: 10 },
  water: { target: DEFAULT_TARGETS.water, tolerance: 0 }, sleep: { target: DEFAULT_TARGETS.sleep, tolerance: 0 }, steps: { target: DEFAULT_TARGETS.steps, tolerance: 0 },
} as const;
const LIMITS: Readonly<Record<Metric, readonly [number, number]>> = {
  weight: [30, 300], energy: [0, 10000], protein: [0, 1000], water: [0, 20], sleep: [0, 24], steps: [0, 100000],
};

function parseMetric(metric: Metric, value: string): number {
  const text = value.trim().toLowerCase();
  if (metric === "sleep") {
    const hours = /^(\d+(?:\.\d+)?)\s*h(?:\s*(\d{1,2})\s*m?)?$/.exec(text);
    const clock = /^(\d{1,2}):(\d{2})$/.exec(text);
    const parts = hours ?? clock;
    if (parts) return Number(parts[2] ?? 0) < 60 ? Number(parts[1]) + Number(parts[2] ?? 0) / 60 : NaN;
  }
  const normalized = metric === "steps" && /^\d{1,3}(,\d{3})+$/.test(text) ? text.replaceAll(",", "")
    : metric === "weight" || metric === "water" || metric === "sleep" ? text.replace(",", ".") : text;
  return /^\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
}

/** The same validated, UI-independent operation serves typed callers and the SAM acceptor. */
export function setMetric(input: Readonly<{ scorecard: Scorecard; metric: Metric; value: unknown }>): ScorecardResult<Scorecard> {
  if (typeof input.value !== "string") return err({ code: "invalid_input", message: "Enter a number." });
  const { scorecard, metric, value } = input;
  const parsed = value.trim() === "" ? undefined : parseMetric(metric, value);
  const [min, max] = LIMITS[metric];
  if (parsed !== undefined && (!Number.isFinite(parsed) || parsed < min || parsed > max ||
      ((metric === "steps" || metric === "energy") && !Number.isInteger(parsed)))) {
    return err({ code: "invalid_input", message: `Enter ${metric === "steps" || metric === "energy" ? "a whole number" : "a number"} between ${min} and ${max}.` });
  }
  return ok({ ...scorecard, values: { ...scorecard.values, [metric]: parsed } });
}

export function setDailyCheck(input: Readonly<{ scorecard: Scorecard; check: DailyCheck; complete: boolean }>): ScorecardResult<Scorecard> {
  return ok({ ...input.scorecard, checks: { ...input.scorecard.checks, [input.check]: input.complete } });
}

export function addGoal(input: Readonly<{ scorecard: Scorecard; text: string }>): ScorecardResult<Scorecard> {
  const text = input.text.trim();
  if (!text || text.length > 200 || input.scorecard.goals.length >= 10) {
    return err({ code: "invalid_input", message: "Add up to ten goals, each between 1 and 200 characters." });
  }
  const id = Math.max(0, ...input.scorecard.goals.map(goal => goal.id)) + 1;
  return ok({ ...input.scorecard, goals: [...input.scorecard.goals, { id, text, priority: false }] });
}

export function selectPriority(input: Readonly<{ scorecard: Scorecard; id: number }>): ScorecardResult<Scorecard> {
  const selected = input.scorecard.goals.find(goal => goal.id === input.id);
  if (!selected) return err({ code: "invalid_input", message: "Choose an existing goal." });
  return ok({ ...input.scorecard, goals: input.scorecard.goals.map(goal => ({ ...goal, priority: goal.id === input.id && !selected.priority })) });
}

export function representDay(scorecard: Scorecard, targets: Targets = DEFAULT_TARGETS) {
  const v = scorecard.values;
  const met = (metric: keyof typeof TARGETS) => v[metric] !== undefined && (metric === "energy"
    ? Math.abs(v[metric] - targets[metric]) <= TARGETS[metric].tolerance
    : v[metric] >= targets[metric] - TARGETS[metric].tolerance);
  const priority = scorecard.goals.find(goal => goal.priority)?.text ?? "";
  const complete = {
    energy: met("energy"), protein: met("protein"), water: met("water"), sleep: met("sleep"), steps: met("steps"),
    training: scorecard.checks.training, map: scorecard.checks.map, focus: scorecard.checks.focus,
    ltr: scorecard.brainDump.trim().length > 0 && priority.length > 0,
  } as const;
  return { complete, priority, allDone: Object.values(complete).every(Boolean) } as const;
}

export function emptyScorecard(): Scorecard {
  return { values: { weight: undefined, energy: undefined, protein: undefined, water: undefined, sleep: undefined, steps: undefined },
    checks: { training: false, map: false, focus: false }, brainDump: "", goals: [] };
}

export function parseScorecard(value: unknown): ScorecardResult<Scorecard> {
  const fail = () => err({ code: "invalid_input", message: "Invalid scorecard values or goals." } as const);
  if (!isRecord(value) || !isRecord(value.values) || !isRecord(value.checks) || !isText(value.brainDump, 5000) ||
      !Array.isArray(value.goals) || value.goals.length > 10 || !["training", "map", "focus"].every(key => typeof (isRecord(value.checks) ? value.checks[key] : undefined) === "boolean")) return fail();
  let card = emptyScorecard();
  for (const metric of Object.keys(card.values) as Metric[]) {
    const v = value.values[metric];
    if (v !== undefined && v !== null && typeof v !== "number") return fail();
    const next = setMetric({ scorecard: card, metric, value: v === undefined || v === null ? "" : String(v) });
    if (!next.ok) return fail();
    card = next.value;
  }
  const goals: Goal[] = [];
  for (const goal of value.goals) {
    if (!isRecord(goal) || typeof goal.id !== "number" || !Number.isSafeInteger(goal.id) || goal.id < 1 || !isText(goal.text, 200) || !goal.text.trim() || typeof goal.priority !== "boolean") return fail();
    goals.push({ id: goal.id, text: goal.text, priority: goal.priority });
  }
  if (new Set(goals.map(goal => goal.id)).size !== goals.length || goals.filter(goal => goal.priority).length > 1) return fail();
  return ok({ ...card, brainDump: value.brainDump, goals, checks: { training: value.checks.training as boolean, map: value.checks.map as boolean, focus: value.checks.focus as boolean } });
}
