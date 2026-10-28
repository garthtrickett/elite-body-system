import { isDay, isRecord, isText } from "../../shared/validation.ts";
import { clientDay } from "../profile/browser.ts";
import { err, ok } from "../../shared/result.ts";
import type { ClientResult } from "../../shared/client-result.ts";

export const FUNDAMENTALS = { training: "Training", nutrition: "Nutrition", recovery: "Recovery", mindset: "Mindset" } as const;
export const EFFECTIVENESS = { energy: "Energy", judgement: "Judgement", focus: "Focus", drive: "Drive" } as const;
export const SCORES = { ...FUNDAMENTALS, ...EFFECTIVENESS };
export type Score = keyof typeof SCORES;
export const MEASURES = { weight: { label: "Weight", unit: "kg", min: 30, max: 300 }, waist: { label: "Waist", unit: "cm", min: 1, max: 300 }, muscle: { label: "Priority muscle group", unit: "cm", min: 1, max: 300 } } as const;
export type Measure = keyof typeof MEASURES;
export type MeasurementDraft = Readonly<Record<Measure, string>>;
export const PRIORITY_MOVEMENT = { unchanged: "Unchanged", improved: "Improved" } as const;
export type PriorityMovement = keyof typeof PRIORITY_MOVEMENT;
export const PROGRESSIVE_OVERLOAD = {
  load: "More Load Moved (Strength)",
  reps: "More Reps (Endurance)",
  control: "More Control (Technique)",
  range: "More Range (Mobility)",
} as const;
export type ProgressiveOverload = keyof typeof PROGRESSIVE_OVERLOAD;
export const QUESTIONS = [
  "What's the one thing that would make next week easier?",
  "Did you beat last week on at least one lift? Which one?",
  "Where did you act like the person you want to be this week?",
  "What's one thing you did this week that drained energy for no result?",
  "What did you eat or skip that made the biggest difference to how you felt?",
  "When did you feel most focused this week, and what was around it?",
  "What decision this week are you glad you made?",
  "What's one thing you're doing next week that you'd have avoided before?",
] as const;
export type Answers = Readonly<{ wins: string; lesson: string; scores: Readonly<Record<Score, number | null>>; data: Readonly<Record<Measure, number | null> & { priorityMovement: PriorityMovement | null; progressiveOverload: readonly ProgressiveOverload[] }>; reflection: string; qIndex: number; answer: string }>;
export type Entry = Readonly<{ week: string; revision: number; answers: Answers; rawMeasurements: MeasurementDraft; question: string; savedAt: string; submittedAt: string | null }>;
export type Snapshot = Readonly<{ enabled: boolean; enrolled: boolean; timezone: string; hour: number; week: string; due: boolean; required: boolean; flowPreview?: boolean; current: Entry | null; history: readonly Entry[]; nextCursor: string | null }>;
export type History = Readonly<{ entries: readonly Entry[]; nextCursor: string | null }>;
const dayMillis = 86_400_000;
export function dateShift(day: string, days: number): string { return new Date(Date.parse(`${day}T12:00:00Z`) + days * dayMillis).toISOString().slice(0, 10); }
export function firstSaturday(day: string): string { return dateShift(day, (6 - new Date(`${day}T12:00:00Z`).getUTCDay() + 7) % 7); }
export function weeklyPeriod(input: Readonly<{ now: Date; timezone: string; firstWeek: string; hour: number }>): Readonly<{ week: string; due: boolean }> {
  const today = clientDay(input);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: input.timezone, hour: "2-digit", hourCycle: "h23" }).format(input.now));
  let week = dateShift(today, -((weekday + 1) % 7));
  if (weekday === 6 && hour < input.hour) week = dateShift(week, -7);
  return week < input.firstWeek ? { week: input.firstWeek, due: false } : { week, due: true };
}
export function defaultQuestion(week: string): number { return Math.floor(Date.parse(`${week}T12:00:00Z`) / (7 * dayMillis)) % QUESTIONS.length; }
export function blankAnswers(week: string): Answers { return { wins: "", lesson: "", scores: { training: null, nutrition: null, recovery: null, mindset: null, energy: null, judgement: null, focus: null, drive: null }, data: { weight: null, waist: null, muscle: null, priorityMovement: null, progressiveOverload: [] }, reflection: "", qIndex: defaultQuestion(week), answer: "" }; }
export function parseAnswers(value: unknown): ClientResult<Answers> {
  const fail = () => err({ code: "invalid_input", message: "Check the ratings, measurements and text in your check-in." } as const);
  if (!isRecord(value) || !isText(value.wins, 2000) || !isText(value.reflection, 4000) || !isText(value.answer, 4000) || !isRecord(value.scores) || !isRecord(value.data) || typeof value.qIndex !== "number" || !Number.isInteger(value.qIndex) || value.qIndex < 0 || value.qIndex >= QUESTIONS.length) return fail();
  const lesson = value.lesson === undefined ? "" : value.lesson;
  if (!isText(lesson, 4000)) return fail();
  const scores = value.scores, data = value.data;
  const priorityMovement = data.priorityMovement ?? null;
  if (priorityMovement !== null && priorityMovement !== "unchanged" && priorityMovement !== "improved") return fail();
  const overload = data.progressiveOverload ?? [];
  if (!Array.isArray(overload) || overload.length > 4 || new Set(overload).size !== overload.length || !overload.every(item => typeof item === "string" && Object.hasOwn(PROGRESSIVE_OVERLOAD, item))) return fail();
  const progressiveOverload = priorityMovement === "improved" ? (Object.keys(PROGRESSIVE_OVERLOAD) as ProgressiveOverload[]).filter(key => overload.includes(key)) : [];
  if (!Object.keys(SCORES).every(key => scores[key] === null || typeof scores[key] === "number" && Number.isInteger(scores[key]) && Number(scores[key]) >= 1 && Number(scores[key]) <= 10)) return fail();
  if (!(Object.keys(MEASURES) as Measure[]).every(key => data[key] === null || typeof data[key] === "number" && Number.isFinite(data[key]) && Number(data[key]) >= MEASURES[key].min && Number(data[key]) <= MEASURES[key].max)) return fail();
  return ok({ wins: value.wins.trim(), lesson: lesson.trim(), reflection: value.reflection.trim(), answer: value.answer.trim(), qIndex: value.qIndex,
    scores: Object.fromEntries(Object.keys(SCORES).map(key => [key, scores[key]])) as Answers["scores"], data: { weight: data.weight as number | null, waist: data.waist as number | null, muscle: data.muscle as number | null, priorityMovement, progressiveOverload } });
}
export function missingScores(answers: Answers): readonly string[] { return (Object.keys(SCORES) as Score[]).filter(key => answers.scores[key] === null).map(key => SCORES[key]); }
/** Older records may contain multiple choices; new writes select one primary form. */
export function progressiveOverloadProblem(input: Readonly<{ answers: Answers; submit: boolean }>): string | null {
  const count = input.answers.data.progressiveOverload.length;
  return count > 1 || input.submit && input.answers.data.priorityMovement === "improved" && count !== 1
    ? "Select the primary form of progressive overload you used." : null;
}
export const INCOMPLETE_SECTION_MESSAGE = "Fill out this section then click complete to send it";
export type CheckinSection = "wins" | "fundamentals" | "effectiveness" | "data" | "question";
export function parseMeasurementDraft(value: unknown, answers: Answers): MeasurementDraft | undefined {
  if (value === undefined) return Object.fromEntries((Object.keys(MEASURES) as Measure[]).map(key => [key, answers.data[key] === null ? "" : String(answers.data[key])])) as MeasurementDraft;
  if (!isRecord(value) || !(Object.keys(MEASURES) as Measure[]).every(key => isText(value[key], 50))) return;
  return { weight: value.weight as string, waist: value.waist as string, muscle: value.muscle as string };
}
/** Incomplete numeric input stays in the draft; only valid numbers become measurements. */
export function withMeasurements(input: Readonly<{ answers: Answers; rawMeasurements: MeasurementDraft }>): Answers {
  const measurements = Object.fromEntries((Object.keys(MEASURES) as Measure[]).map(key => {
    const raw = input.rawMeasurements[key].trim(), value = raw === "" ? NaN : Number(raw), bounds = MEASURES[key];
    return [key, Number.isFinite(value) && value >= bounds.min && value <= bounds.max ? value : null];
  })) as Readonly<Record<Measure, number | null>>;
  return { ...input.answers, data: { ...input.answers.data, ...measurements } };
}
export function incompleteSections(input: Readonly<{ answers: Answers; rawMeasurements: MeasurementDraft }>): readonly CheckinSection[] {
  const answers = withMeasurements(input), sections: CheckinSection[] = [];
  if (!answers.wins.trim()) sections.push("wins");
  if ((Object.keys(FUNDAMENTALS) as Score[]).some(key => answers.scores[key] === null)) sections.push("fundamentals");
  if ((Object.keys(EFFECTIVENESS) as Score[]).some(key => answers.scores[key] === null)) sections.push("effectiveness");
  if (answers.data.priorityMovement === null || progressiveOverloadProblem({ answers, submit: true }) || (Object.keys(MEASURES) as Measure[]).some(key => answers.data[key] === null)) sections.push("data");
  if (!answers.answer.trim()) sections.push("question");
  return sections;
}
export function parseEntry(value: unknown): Entry | undefined {
  if (!isRecord(value) || !isDay(value.week) || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 1 || typeof value.savedAt !== "string" || !Number.isFinite(Date.parse(value.savedAt)) || !(value.submittedAt === null || typeof value.submittedAt === "string" && Number.isFinite(Date.parse(value.submittedAt)))) return;
  const answers = parseAnswers(value.answers);
  if (!answers.ok || !isText(value.question, 1000) || !value.question.trim() || value.submittedAt && missingScores(answers.value).length) return;
  const rawMeasurements = parseMeasurementDraft(value.rawMeasurements, answers.value);
  if (!rawMeasurements) return;
  return { week: value.week, revision: value.revision, answers: answers.value, rawMeasurements, question: value.question, savedAt: value.savedAt, submittedAt: value.submittedAt };
}
export function parseHistory(value: unknown): History | undefined {
  if (!isRecord(value) || !Array.isArray(value.entries) || !(value.nextCursor === null || isDay(value.nextCursor))) return;
  const entries = value.entries.map(parseEntry);
  if (entries.some(entry => !entry)) return;
  return { entries: entries as Entry[], nextCursor: value.nextCursor };
}
export function parseSnapshot(value: unknown): Snapshot | undefined {
  if (!isRecord(value) || typeof value.enabled !== "boolean" || typeof value.enrolled !== "boolean" || typeof value.timezone !== "string" || typeof value.hour !== "number" || !Number.isInteger(value.hour) || value.hour < 0 || value.hour > 23 || !isDay(value.week) || typeof value.due !== "boolean" || typeof value.required !== "boolean") return;
  if (value.flowPreview !== undefined && typeof value.flowPreview !== "boolean") return;
  const history = parseHistory({ entries: value.history, nextCursor: value.nextCursor });
  const current = value.current === null ? null : parseEntry(value.current);
  if (!history || current === undefined) return;
  return { enabled: value.enabled, enrolled: value.enrolled, timezone: value.timezone, hour: value.hour, week: value.week, due: value.due, required: value.required, flowPreview: value.flowPreview === true, current, history: history.entries, nextCursor: history.nextCursor };
}
