import type { ClientResult } from "../../shared/client-result.ts";
import { isDay } from "../../shared/validation.ts";
import { emptyMeal, emptyNutrients, parseMeal, mealTotals, MACROS, MICROS, isUuid } from "./data.ts";
import type { Meal, MealSnapshot, Macro, Micro } from "./data.ts";
import type { MealPhoto } from "./provider.ts";
export type MealEffect =
  | Readonly<{ kind: "load"; id: number; date?: string }>
  | Readonly<{ kind: "preparePhotos"; id: number; selection: number }>
  | Readonly<{ kind: "analyze"; id: number; description: string; photos: readonly MealPhoto[] }>
  | Readonly<{ kind: "log"; id: number; requestId: string; date: string; meal: Meal; favorite: boolean }>
  | Readonly<{ kind: "remove" | "removeFavorite"; id: number; mealId: string; date: string }>;
export type MealModel = Readonly<{
  snapshot: MealSnapshot | null; draft: Meal | null; fields: Readonly<Record<string, string>>; description: string; photos: readonly MealPhoto[];
  favorite: boolean; sequence: number; pending: MealEffect | null; retry: MealEffect | null; error: string | null; message: string | null;
}>;
export type MealProposal =
  | Readonly<{ kind: "started" | "manualRequested" | "draftCancelled" | "analysisRequested" | "ingredientAdded" | "retry" | "reload" }>
  | Readonly<{ kind: "descriptionChanged"; value: string }>
  | Readonly<{ kind: "dateChanged"; value: string }>
  | Readonly<{ kind: "photosRequested"; selection: number }>
  | Readonly<{ kind: "photosPrepared"; id: number; result: ClientResult<readonly MealPhoto[]> }>
  | Readonly<{ kind: "photoRemoved"; index: number }>
  | Readonly<{ kind: "draftNamed" | "draftNoted"; value: string }>
  | Readonly<{ kind: "ingredientNamed"; index: number; value: string }>
  | Readonly<{ kind: "fieldChanged"; index: number; field: "grams" | Macro | Micro; value: string }>
  | Readonly<{ kind: "fieldCommitted"; index: number; field: "grams" | Macro | Micro }>
  | Readonly<{ kind: "ingredientRemoved"; index: number }>
  | Readonly<{ kind: "favoriteChanged"; value: boolean }>
  | Readonly<{ kind: "favoriteSelected"; id: string }>
  | Readonly<{ kind: "logRequested"; requestId: string }>
  | Readonly<{ kind: "removeRequested" | "removeFavoriteRequested"; id: string }>
  | Readonly<{ kind: "analyzed"; id: number; result: ClientResult<Meal> }>
  | Readonly<{ kind: "completed"; id: number; effectKind: "load" | "log" | "remove" | "removeFavorite"; result: ClientResult<MealSnapshot> }>
  | Readonly<{ kind: "failed"; id: number }>;
export const initialMealModel = (): MealModel => ({ snapshot: null, draft: null, fields: {}, description: "", photos: [], favorite: false, sequence: 0, pending: null, retry: null, error: null, message: null });
const fieldKey = (index: number, field: string) => `${index}:${field}`;
function queue(model: MealModel, effect: MealEffect): MealModel { return { ...model, sequence: effect.id, pending: effect, retry: null, error: null, message: null }; }
function review(model: MealModel, meal: Meal): MealModel { return { ...model, draft: meal, fields: {}, favorite: false, pending: null, error: null, message: null }; }
function applyFields(model: MealModel): ClientResult<Meal> {
  if (!model.draft) return { ok: false, error: { code: "invalid_input", message: "Choose a meal to review first." } };
  return parseMeal({ ...model.draft, items: model.draft.items.map((item, index) => {
    const numeric = (field: string, fallback: number | null) => { const text = model.fields[fieldKey(index, field)]; return text === undefined ? fallback : text.trim() === "" ? (field === "grams" || MACROS.includes(field as Macro) ? NaN : null) : /^\d+(\.\d+)?$/.test(text.trim()) ? Number(text) : NaN; };
    const changed = [...MACROS, ...MICROS].some(field => model.fields[fieldKey(index, field)] !== undefined);
    return { ...item, grams: numeric("grams", item.grams), source: changed ? "manual" : item.source,
      per100: { energy: numeric("energy", item.per100.energy), protein: numeric("protein", item.per100.protein), carbs: numeric("carbs", item.per100.carbs), fat: numeric("fat", item.per100.fat), fibre: numeric("fibre", item.per100.fibre), iron: numeric("iron", item.per100.iron), potassium: numeric("potassium", item.per100.potassium), vitaminC: numeric("vitaminC", item.per100.vitaminC) } };
  }) });
}

export function acceptMealProposal(model: MealModel, proposal: MealProposal): MealModel {
  const id = model.sequence + 1;
  if (proposal.kind === "started") return !model.snapshot && !model.pending ? queue(model, { kind: "load", id }) : model;
  if (proposal.kind === "failed") {
    if (model.pending?.id !== proposal.id) return model;
    return { ...model, pending: null, retry: model.pending, error: "Could not confirm the action. Retry safely." };
  }
  if (proposal.kind === "photosPrepared") {
    if (model.pending?.id !== proposal.id || model.pending.kind !== "preparePhotos") return model;
    return proposal.result.ok ? { ...model, pending: null, photos: [...model.photos, ...proposal.result.value].slice(0, 4), error: null }
      : { ...model, pending: null, error: proposal.result.error.message };
  }
  if (proposal.kind === "analyzed") {
    if (model.pending?.id !== proposal.id || model.pending.kind !== "analyze") return model;
    return proposal.result.ok ? review({ ...model, description: "", photos: [] }, proposal.result.value)
      : { ...model, pending: null, retry: model.pending, error: proposal.result.error.message };
  }
  if (proposal.kind === "completed") {
    if (model.pending?.id !== proposal.id || model.pending.kind !== proposal.effectKind) return model;
    if (!proposal.result.ok) return { ...model, pending: null, retry: proposal.result.error.code === "invalid_input" || proposal.result.error.code === "forbidden" ? null : model.pending, error: proposal.result.error.message };
    return { ...model, snapshot: proposal.result.value, pending: null, retry: null, error: null,
      ...(proposal.effectKind === "log" ? { draft: null, fields: {}, favorite: false, message: "Meal added to your day’s calories and protein." } : {}) };
  }
  if (model.pending) return model;
  if (proposal.kind === "retry") return model.retry ? queue(model, { ...model.retry, id }) : model;
  // An uncertain write keeps its exact payload/request ID until confirmed or explicitly reloaded.
  if (proposal.kind === "reload") return queue({ ...model, draft: null, fields: {}, retry: null }, { kind: "load", id, ...(model.snapshot ? { date: model.snapshot.date } : {}) });
  if (model.retry && ["log", "remove", "removeFavorite"].includes(model.retry.kind)) return model;
  if (proposal.kind === "descriptionChanged") return { ...model, description: proposal.value.slice(0, 4000), error: null, retry: null };
  if (proposal.kind === "dateChanged") return isDay(proposal.value) ? queue(model, { kind: "load", id, date: proposal.value }) : model;
  if (proposal.kind === "photosRequested") return model.photos.length < 4 ? queue(model, { kind: "preparePhotos", id, selection: proposal.selection }) : { ...model, error: "Remove a photo before adding another. Four photos maximum." };
  if (proposal.kind === "photoRemoved") return { ...model, photos: model.photos.filter((_, index) => index !== proposal.index), retry: null };
  if (proposal.kind === "analysisRequested") {
    if (!model.snapshot?.analysisAvailable) return { ...model, error: "Meal analysis is not available yet. Enter nutrition manually." };
    if (!model.description.trim() && model.photos.length === 0) return { ...model, error: "Describe your meal or add a photo first." };
    return queue(model, { kind: "analyze", id, description: model.description, photos: model.photos });
  }
  if (proposal.kind === "manualRequested") return review(model, emptyMeal());
  if (proposal.kind === "favoriteSelected") { const meal = model.snapshot?.favorites.find(item => item.id === proposal.id); return meal ? review(model, meal.meal) : model; }
  if (proposal.kind === "draftCancelled") return { ...model, draft: null, fields: {}, retry: null, error: null };
  if (proposal.kind === "removeRequested" || proposal.kind === "removeFavoriteRequested") {
    if (!model.snapshot) return model;
    const exists = proposal.kind === "removeRequested" ? model.snapshot.entries.some(item => item.id === proposal.id) : model.snapshot.favorites.some(item => item.id === proposal.id);
    return exists ? queue(model, { kind: proposal.kind === "removeRequested" ? "remove" : "removeFavorite", id, mealId: proposal.id, date: model.snapshot.date }) : model;
  }
  if (!model.draft) return model;
  if (proposal.kind === "draftNamed" || proposal.kind === "draftNoted") return { ...model, draft: { ...model.draft, [proposal.kind === "draftNamed" ? "name" : "note"]: proposal.value.slice(0, proposal.kind === "draftNamed" ? 100 : 2000) }, error: null };
  if (proposal.kind === "favoriteChanged") return { ...model, favorite: proposal.value };
  if (proposal.kind === "ingredientNamed") return { ...model, draft: { ...model.draft, items: model.draft.items.map((item, index) => index === proposal.index ? { ...item, name: proposal.value.slice(0, 120) } : item) } };
  if (proposal.kind === "fieldChanged") return model.draft.items[proposal.index] ? { ...model, fields: { ...model.fields, [fieldKey(proposal.index, proposal.field)]: proposal.value }, error: null } : model;
  if (proposal.kind === "fieldCommitted") { const meal = applyFields(model); return meal.ok ? { ...model, draft: meal.value, fields: {}, error: null } : { ...model, error: meal.error.message }; }
  if (proposal.kind === "ingredientAdded") {
    const meal = applyFields(model); if (!meal.ok) return { ...model, error: meal.error.message };
    return meal.value.items.length < 12 ? { ...model, draft: { ...meal.value, items: [...meal.value.items, { name: "Ingredient", grams: 100, per100: emptyNutrients(), source: "manual" }] }, fields: {} } : model;
  }
  if (proposal.kind === "ingredientRemoved") {
    const meal = applyFields(model); if (!meal.ok) return { ...model, error: meal.error.message };
    return meal.value.items.length > 1 ? { ...model, draft: { ...meal.value, items: meal.value.items.filter((_, index) => index !== proposal.index) }, fields: {} } : model;
  }
  if (proposal.kind === "logRequested") {
    if (!model.snapshot || !isUuid(proposal.requestId)) return model;
    const meal = applyFields(model); if (!meal.ok) return { ...model, error: meal.error.message };
    if (!meal.value.items.some(item => item.grams > 0) || mealTotals(meal.value).energy <= 0) return { ...model, error: "Add a portion and calories before logging this meal." };
    return queue({ ...model, draft: meal.value, fields: {} }, { kind: "log", id, requestId: proposal.requestId, date: model.snapshot.date, meal: meal.value, favorite: model.favorite });
  }
  return model;
}
export function representMeals(model: MealModel) {
  const parsed = model.draft ? applyFields(model) : null;
  return { ...model, busy: model.pending !== null, locked: model.pending !== null || !!model.retry && ["log", "remove", "removeFavorite"].includes(model.retry.kind), totals: parsed?.ok ? mealTotals(parsed.value) : null } as const;
}
export type MealState = ReturnType<typeof representMeals>;
