import { sql } from "kysely";
import type { Kysely } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
import type { MealEntriesId } from "../../platform/database/generated/public/MealEntries.ts";
import type { SavedMealsId } from "../../platform/database/generated/public/SavedMeals.ts";
import { err, ok } from "../../shared/result.ts";
import type { ClientResult, ClientFailure } from "../../shared/client-result.ts";
import { isDay } from "../../shared/validation.ts";
import { clientDay } from "../profile/index.ts";
import type { createProfiles } from "../profile/index.ts";
import { adjustNutrition } from "../scorecard/index.ts";
import { parseMeal, mealTotals, isUuid } from "./data.ts";
import type { Meal, MealSnapshot, MealEntry, SavedMeal } from "./data.ts";
import { createAnalysisLimit } from "./analysis-limit.ts";
import { parseMealInput } from "./provider.ts";
import type { MealAnalyzer } from "./provider.ts";

export function createMeals(config: Readonly<{ db: Kysely<Database>; profiles: ReturnType<typeof createProfiles>; analyzer: MealAnalyzer; now?: () => Date }>) {
  const db = config.db, now = config.now ?? (() => new Date()), limits = createAnalysisLimit(db);
  async function dateFor(input: Readonly<{ accountId: string; date?: unknown }>): Promise<ClientResult<string>> {
    const profile = await config.profiles.get({ accountId: input.accountId }); if (!profile.ok) return profile;
    const today = clientDay({ timezone: profile.value.profile.timezone, now: now() }), date = input.date ?? today;
    return isDay(date) && date <= today ? ok(date) : err({ code: "invalid_input", message: "Choose today or a past meal date." });
  }
  async function get(input: Readonly<{ accountId: string; date?: unknown }>): Promise<ClientResult<MealSnapshot>> {
    const date = await dateFor(input); if (!date.ok) return date;
    try {
      const accountId = input.accountId as AccountsId;
      const [rows, saved] = await Promise.all([
        db.selectFrom("meal_entries").select(["id", "day", "data"]).where("account_id", "=", accountId).where("day", "=", new Date(date.value)).where("removed", "=", false).orderBy("created_at", "desc").limit(100).execute(),
        db.selectFrom("saved_meals").select(["id", "data"]).where("account_id", "=", accountId).orderBy("created_at", "desc").limit(30).execute(),
      ]);
      const entries: MealEntry[] = [], favorites: SavedMeal[] = [];
      for (const row of rows) { const meal = parseMeal(row.data); if (!meal.ok) return err({ code: "unavailable", message: "A stored meal could not be read." }); entries.push({ id: row.id, date: date.value, meal: meal.value }); }
      for (const row of saved) { const meal = parseMeal(row.data); if (!meal.ok) return err({ code: "unavailable", message: "A saved meal could not be read." }); favorites.push({ id: row.id, meal: meal.value }); }
      return ok({ date: date.value, entries, favorites, analysisAvailable: config.analyzer.available });
    } catch { return err({ code: "unavailable", message: "Your meals could not be loaded." }); }
  }
  return {
    get,
    async analyze(input: Readonly<{ accountId: string; meal: unknown }>): Promise<ClientResult<Meal>> {
      const parsed = parseMealInput(input.meal); if (!parsed.ok) return parsed;
      if (!config.analyzer.available) return err({ code: "not_configured", message: "Meal analysis is not available yet. Enter nutrition manually or reuse a saved meal." });
      const lease = await limits.reserve({ accountId: input.accountId }); if (!lease.ok) return lease;
      try { return await config.analyzer.analyze(parsed.value); }
      finally { await limits.release({ accountId: input.accountId, lease: lease.value }); }
    },
    async log(input: Readonly<{ accountId: string; date: unknown; requestId: unknown; meal: unknown; favorite: unknown }>): Promise<ClientResult<MealSnapshot>> {
      if (!isUuid(input.requestId) || typeof input.favorite !== "boolean") return err({ code: "invalid_input", message: "A meal request ID and favorite choice are required." });
      const parsed = parseMeal(input.meal); if (!parsed.ok) return parsed;
      const totals = mealTotals(parsed.value);
      if (!parsed.value.items.some(item => item.grams > 0) || totals.energy <= 0) return err({ code: "invalid_input", message: "Add a portion and calories before logging this meal." });
      const date = await dateFor(input); if (!date.ok) return date;
      const accountId = input.accountId as AccountsId, id = input.requestId as MealEntriesId, favorite = input.favorite;
      let failure: ClientFailure | undefined;
      try {
        await db.transaction().execute(async tx => {
          const inserted = await tx.insertInto("meal_entries").values({ account_id: accountId, id, day: date.value, data: sql`cast(${JSON.stringify(parsed.value)} as jsonb)`, favorite })
            .onConflict(c => c.columns(["account_id", "id"]).doNothing()).returning("id").executeTakeFirst();
          if (!inserted) {
            const existing = await tx.selectFrom("meal_entries").select(["data", "day", "favorite"]).where("account_id", "=", accountId).where("id", "=", id).executeTakeFirstOrThrow();
            const old = parseMeal(existing.data);
            const oldDate = existing.day instanceof Date ? existing.day.toISOString().slice(0, 10) : String(existing.day);
            if (!old.ok || oldDate !== date.value || existing.favorite !== favorite || JSON.stringify(old.value) !== JSON.stringify(parsed.value)) {
              failure = { code: "conflict", message: "This meal request was already used. Reload before logging another meal." }; throw new Error("Meal conflict");
            }
            return; // A retry after a lost response never increments nutrition twice.
          }
          const adjusted = await adjustNutrition({ transaction: tx, accountId: input.accountId, date: date.value, energy: Math.round(totals.energy), protein: totals.protein });
          if (!adjusted.ok) { failure = adjusted.error; throw new Error("Nutrition rejected"); }
          if (favorite) await tx.insertInto("saved_meals").values({ account_id: accountId, id: id as string as SavedMealsId, data: sql`cast(${JSON.stringify(parsed.value)} as jsonb)` }).execute();
        });
        return get({ accountId: input.accountId, date: date.value });
      } catch { return err(failure ?? { code: "unavailable", message: "Could not confirm the meal was logged. Retry this same request safely." }); }
    },
    async remove(input: Readonly<{ accountId: string; id: unknown; date: unknown }>): Promise<ClientResult<MealSnapshot>> {
      if (!isUuid(input.id)) return err({ code: "invalid_input", message: "Choose a logged meal." });
      const date = await dateFor(input); if (!date.ok) return date;
      let failure: ClientFailure | undefined;
      try {
        await db.transaction().execute(async tx => {
          const row = await tx.updateTable("meal_entries").set({ removed: true }).where("account_id", "=", input.accountId as AccountsId).where("id", "=", input.id as MealEntriesId).where("day", "=", new Date(date.value)).where("removed", "=", false).returning("data").executeTakeFirst();
          if (!row) return;
          const meal = parseMeal(row.data); if (!meal.ok) throw new Error("Unreadable meal");
          const totals = mealTotals(meal.value);
          const result = await adjustNutrition({ transaction: tx, accountId: input.accountId, date: date.value, energy: -Math.round(totals.energy), protein: -totals.protein });
          if (!result.ok) { failure = result.error; throw new Error("Nutrition rejected"); }
        });
        return get({ accountId: input.accountId, date: date.value });
      } catch { return err(failure ?? { code: "unavailable", message: "Meal removal could not be confirmed. You can retry safely." }); }
    },
    async removeFavorite(input: Readonly<{ accountId: string; id: unknown; date: unknown }>): Promise<ClientResult<MealSnapshot>> {
      if (!isUuid(input.id)) return err({ code: "invalid_input", message: "Choose a saved meal." });
      const date = await dateFor(input); if (!date.ok) return date;
      try { await db.deleteFrom("saved_meals").where("account_id", "=", input.accountId as AccountsId).where("id", "=", input.id as SavedMealsId).execute(); return get({ accountId: input.accountId, date: date.value }); }
      catch { return err({ code: "unavailable", message: "Saved meal could not be removed. Try again." }); }
    },
  } as const;
}
