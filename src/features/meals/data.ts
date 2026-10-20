import { isRecord, isText, isDay } from "../../shared/validation.ts";
import type { ClientResult } from "../../shared/client-result.ts";
import { err, ok } from "../../shared/result.ts";

export const MACROS = ["energy", "protein", "carbs", "fat"] as const;
export const MICROS = ["fibre", "iron", "potassium", "vitaminC"] as const;
export type Macro = typeof MACROS[number];
export type Micro = typeof MICROS[number];
export type Nutrients = Readonly<Record<Macro, number> & Record<Micro, number | null>>;
export type Ingredient = Readonly<{ name: string; grams: number; per100: Nutrients; source: "ai_estimate" | "manual" }>;
export type Meal = Readonly<{ name: string; note: string; items: readonly Ingredient[] }>;
export type MealEntry = Readonly<{ id: string; date: string; meal: Meal }>;
export type SavedMeal = Readonly<{ id: string; meal: Meal }>;
export type MealSnapshot = Readonly<{ date: string; entries: readonly MealEntry[]; favorites: readonly SavedMeal[]; analysisAvailable: boolean }>;
export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export const emptyNutrients = (): Nutrients => ({ energy: 0, protein: 0, carbs: 0, fat: 0, fibre: null, iron: null, potassium: null, vitaminC: null });
export const emptyMeal = (): Meal => ({ name: "My meal", note: "", items: [{ name: "Meal", grams: 100, per100: emptyNutrients(), source: "manual" }] });
const within = (value: unknown, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
export type MealNumberField = "grams" | Macro | Micro;
/** Shared limits for server validation and field-level review feedback. */
export function mealNumberProblem(input: Readonly<{ field: MealNumberField; value: unknown }>): string | null {
  const { field, value } = input;
  if (MICROS.includes(field as Micro) && value === null) return null;
  const max = field === "grams" ? 10000 : field === "potassium" ? 100000 : field === "energy" || MICROS.includes(field as Micro) ? 1000 : 100;
  return within(value, max) ? null : `Enter a number between 0 and ${max.toLocaleString("en-GB")}.`;
}

export function parseMeal(value: unknown): ClientResult<Meal> {
  const fail = () => err({ code: "invalid_input", message: "Check the meal name, portions and nutrition values." } as const);
  if (!isRecord(value) || !isText(value.name, 100) || !value.name.trim() || !isText(value.note, 2000) || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > 12) return fail();
  const items: Ingredient[] = [];
  for (const item of value.items) {
    if (!isRecord(item) || !isText(item.name, 120) || !item.name.trim() || mealNumberProblem({ field: "grams", value: item.grams }) || !isRecord(item.per100) || (item.source !== "ai_estimate" && item.source !== "manual")) return fail();
    const n = item.per100;
    if ([...MACROS, ...MICROS].some(field => mealNumberProblem({ field, value: n[field] }))) return fail();
    items.push({ name: item.name.trim(), grams: item.grams as number, source: item.source,
      per100: { energy: n.energy as number, protein: n.protein as number, carbs: n.carbs as number, fat: n.fat as number, fibre: n.fibre as number | null, iron: n.iron as number | null, potassium: n.potassium as number | null, vitaminC: n.vitaminC as number | null } });
  }
  const meal = { name: value.name.trim(), note: value.note, items };
  const totals = mealTotals(meal);
  if (totals.energy > 20000 || totals.protein > 2000 || totals.carbs > 5000 || totals.fat > 2500) return fail();
  return ok(meal);
}

/** Missing micronutrients stay unknown, rather than turning into invented zeroes. */
export function mealTotals(meal: Meal): Nutrients {
  const sum = (key: Macro | Micro): number | null => meal.items.some(item => item.grams > 0 && item.per100[key] === null) ? null
    : Math.round(meal.items.reduce((total, item) => total + (item.per100[key] ?? 0) * item.grams / 100, 0) * 10) / 10;
  return { energy: sum("energy") ?? 0, protein: sum("protein") ?? 0, carbs: sum("carbs") ?? 0, fat: sum("fat") ?? 0,
    fibre: sum("fibre"), iron: sum("iron"), potassium: sum("potassium"), vitaminC: sum("vitaminC") };
}
export function parseMealSnapshot(value: unknown): MealSnapshot | undefined {
  if (!isRecord(value) || !isDay(value.date) || typeof value.analysisAvailable !== "boolean" || !Array.isArray(value.entries) || value.entries.length > 100 || !Array.isArray(value.favorites) || value.favorites.length > 30) return undefined;
  const entries: MealEntry[] = [], favorites: SavedMeal[] = [];
  for (const entry of value.entries) {
    if (!isRecord(entry) || !isUuid(entry.id) || !isDay(entry.date)) return undefined;
    const meal = parseMeal(entry.meal); if (!meal.ok) return undefined;
    entries.push({ id: entry.id, date: entry.date, meal: meal.value });
  }
  for (const entry of value.favorites) {
    if (!isRecord(entry) || !isUuid(entry.id)) return undefined;
    const meal = parseMeal(entry.meal); if (!meal.ok) return undefined;
    favorites.push({ id: entry.id, meal: meal.value });
  }
  return { date: value.date, entries, favorites, analysisAvailable: value.analysisAvailable };
}
