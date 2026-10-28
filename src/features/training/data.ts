import { baseExercises, parseProgramRules, parseProgramAdjustment } from "./program-rules.ts";
import type { ProgramRules } from "./program-rules.ts";
import type { ProgramAdjustment } from "./programming.ts";
import { PROGRAM, WEEK } from "./catalog.ts";
import type { Exercise } from "./catalog.ts";
import type { ClientProfile, ClientResult } from "../profile/browser.ts";
import { isRecord, isDay, isText } from "../../shared/validation.ts";
import { err, ok } from "../../shared/result.ts";

export type LiftSet = Readonly<{ kg: number; reps: number; done: boolean }>;
export type Workout = Readonly<{
  date: string; planKey: number; programRules?: ProgramRules; startedAt: number | null; finishedAt: number | null;
  sets: Readonly<Record<string, readonly LiftSet[]>>; cardio: Readonly<Record<string, number>>;
  mobility: Readonly<Record<string, readonly boolean[]>>; notes: Readonly<Record<string, string>>;
  swaps: Readonly<Record<string, boolean>>; restUntil: number | null;
}>;
export type TrainingSnapshot = Readonly<{ workout: Workout; revision: number; history: readonly Workout[]; blocked: "setup_required" | "clearance_required" | null; readOnly: boolean; videoUrls: Readonly<Record<string, string>>; adjustments?: readonly ProgramAdjustment[] }>;

export function planFor(input: Readonly<{ profile: ClientProfile; date: string }>): number {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const train = order.filter(day => input.profile.trainingDays.includes(day));
  const recovery = order.filter(day => !train.includes(day) && day !== input.profile.restDay);
  const day = new Date(`${input.date}T12:00:00Z`).getUTCDay();
  if (day === input.profile.restDay) return 0;
  const index = train.indexOf(day);
  return index >= 0 ? [1, 2, 4, 5][index] ?? 0 : [3, 6][recovery.indexOf(day)] ?? 0;
}
export function emptyWorkout(input: Readonly<{ date: string; planKey: number }>): Workout {
  return { ...input, startedAt: null, finishedAt: null, sets: {}, cardio: {}, mobility: {}, notes: {}, swaps: {}, restUntil: null };
}
export function exercisesFor(workout: Workout): readonly Exercise[] {
  return baseExercises(workout).map(exercise => workout.swaps[exercise.id] && exercise.alt
    ? { ...exercise, id: exercise.alt.id, name: exercise.alt.name } : exercise);
}
export function setNumberProblem(input: Readonly<{ field: "kg" | "reps"; value: number; done: boolean }>): string {
  const min = input.field === "reps" && input.done ? 1 : 0;
  return !Number.isFinite(input.value) || input.value < min || input.value > 1000 || (input.field === "reps" && !Number.isInteger(input.value))
    ? `${input.field === "reps" ? "Use whole-number reps" : "Use a weight in kg"} between ${min} and 1,000.` : "";
}
export function parseWorkout(value: unknown): ClientResult<Workout> {
  const fail = () => err({ code: "invalid_input", message: "Check the workout’s exercises, sets, weights and repetitions." } as const);
  if (!isRecord(value) || !isDay(value.date) || typeof value.planKey !== "number" || !WEEK[value.planKey] || !isRecord(value.sets) || !isRecord(value.cardio) || !isRecord(value.mobility) || !isRecord(value.notes) || !isRecord(value.swaps)) return fail();
  for (const key of ["startedAt", "finishedAt", "restUntil"]) if (value[key] !== null && (typeof value[key] !== "number" || !Number.isSafeInteger(value[key]) || value[key] < 0)) return fail();
  const rules = value.programRules === undefined ? undefined : parseProgramRules({planKey:value.planKey,value:value.programRules});
  if(value.programRules !== undefined && !rules)return fail();
  const base = baseExercises({planKey:value.planKey,...(rules?{programRules:rules}:{})}), allowed = new Map(base.flatMap(exercise => [[exercise.id, exercise] as const, ...(exercise.alt ? [[exercise.alt.id, exercise] as const] : [])]));
  const swaps: Record<string, boolean> = {}, sets: Record<string, readonly LiftSet[]> = {}, cardio: Record<string, number> = {}, mobility: Record<string, readonly boolean[]> = {}, notes: Record<string, string> = {};
  for (const [id, swapped] of Object.entries(value.swaps)) {
    if (typeof swapped !== "boolean" || !base.some(exercise => exercise.id === id && exercise.alt)) return fail();
    swaps[id] = swapped;
  }
  for (const [id, rows] of Object.entries(value.sets)) {
    const exercise = allowed.get(id);
    if (!exercise?.sets || !Array.isArray(rows) || rows.length > exercise.sets) return fail();
    const parsed: LiftSet[] = [];
    for (const row of rows) {
      if (!isRecord(row) || typeof row.kg !== "number" || typeof row.reps !== "number" || typeof row.done !== "boolean" || setNumberProblem({ field: "kg", value: row.kg, done: row.done }) || setNumberProblem({ field: "reps", value: row.reps, done: row.done })) return fail();
      parsed.push({ kg: row.kg, reps: row.reps, done: row.done });
    }
    sets[id] = parsed;
  }
  for (const [id, minutes] of Object.entries(value.cardio)) {
    if (!allowed.get(id)?.cardio || typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0 || minutes > 600) return fail();
    cardio[id] = minutes;
  }
  for (const [id, checks] of Object.entries(value.mobility)) {
    const exercise = allowed.get(id);
    if (!exercise?.checklist || !Array.isArray(checks) || checks.length > exercise.checklist.length || !checks.every(c => typeof c === "boolean")) return fail();
    mobility[id] = checks as boolean[];
  }
  for (const [id, note] of Object.entries(value.notes)) { if (!allowed.has(id) || !isText(note)) return fail(); notes[id] = note; }
  return ok({ date: value.date, planKey: value.planKey, ...(rules?{programRules:rules}:{}), sets, cardio, mobility, notes, swaps,
    startedAt: value.startedAt as number | null, finishedAt: value.finishedAt as number | null, restUntil: value.restUntil as number | null });
}

export function workoutStats(input: Readonly<{ workout: Workout; history: readonly Workout[] }>) {
  const sets = Object.values(input.workout.sets).flat().filter(set => set.done);
  const volume = sets.reduce((total, set) => total + set.kg * set.reps, 0);
  const estimate = (set: LiftSet) => set.kg * (1 + set.reps / 30);
  const best: Record<string, number> = {};
  for (const workout of input.history) {
    if (workout.date >= input.workout.date || !workout.finishedAt) continue;
    for (const [id, rows] of Object.entries(workout.sets)) best[id] = Math.max(best[id] ?? 0, ...rows.filter(set => set.done).map(estimate));
  }
  const records = Object.entries(input.workout.sets).flatMap(([id, rows]) => rows.flatMap((set, index) => set.done && (best[id] ?? 0) > 0 && estimate(set) > (best[id] ?? 0) ? [`${id}:${index}`] : []));
  return { sets: sets.length, volume, records, hasActivity: sets.length > 0 || Object.values(input.workout.cardio).some(minutes => minutes > 0) || Object.values(input.workout.mobility).some(checks => checks.some(Boolean)) } as const;
}

export function parseTrainingSnapshot(value: unknown): TrainingSnapshot | undefined {
  if (!isRecord(value) || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.history) || value.history.length > 100 ||
      ![null, "setup_required", "clearance_required"].includes(value.blocked as string | null) || typeof value.readOnly !== "boolean" || !isRecord(value.videoUrls)) return undefined;
  const workout = parseWorkout(value.workout), history: Workout[] = [];
  if (!workout.ok) return undefined;
  for (const item of value.history) { const parsed = parseWorkout(item); if (!parsed.ok) return undefined; history.push(parsed.value); }
  const videoUrls: Record<string, string> = {};
  for (const [key, url] of Object.entries(value.videoUrls)) {
    if (typeof url !== "string") return undefined;
    try { const parsed = new URL(url); if (parsed.protocol !== "https:" || parsed.username || parsed.password) return undefined; } catch { return undefined; }
    videoUrls[key] = url;
  }
  let adjustments: readonly ProgramAdjustment[] | undefined;
  if(value.adjustments!==undefined) {
    if(!Array.isArray(value.adjustments) || value.adjustments.length>50)return;
    const rows:ProgramAdjustment[]=[];
    for(const a of value.adjustments) {
      const parsed=parseProgramAdjustment(a);if(!parsed)return;rows.push(parsed);
    }
    adjustments=rows;
  }
  return { ...(adjustments?{adjustments}:{}), videoUrls, workout: workout.value, revision: value.revision, history, blocked: value.blocked as TrainingSnapshot["blocked"], readOnly: value.readOnly };
}

export function trainingComplete(snapshot: TrainingSnapshot): boolean { return snapshot.blocked === null && (snapshot.workout.planKey === 0 || snapshot.workout.finishedAt !== null); }
