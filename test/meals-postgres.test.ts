import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/platform/database/connection.ts";
import { createProfiles, createPostgresProfileStore } from "../src/features/profile/index.ts";
import { createMeals, createOpenAiMealAnalyzer, emptyMeal, mealTotals } from "../src/features/meals/index.ts";
import type { MealAnalyzer, Meal } from "../src/features/meals/index.ts";
import { createScorecards } from "../src/features/scorecard/index.ts";
import { startTestApp, testDatabaseUrl } from "./support/app.ts";
const db = createDatabase(testDatabaseUrl()), profiles = createProfiles({ store: createPostgresProfileStore(db) });
const meals = createMeals({ db, profiles, analyzer: createOpenAiMealAnalyzer({}) });
const date = new Date().toISOString().slice(0, 10), scorecards = createScorecards(db);
const meal = (): Meal => ({ ...emptyMeal(), name: "Chicken and rice", items: [{ ...emptyMeal().items[0]!, name: "Chicken and rice", grams: 200, per100: { ...emptyMeal().items[0]!.per100, energy: 200, protein: 20, carbs: 25, fat: 5 } }] });
let app: Awaited<ReturnType<typeof startTestApp>>;
before(async () => { app = await startTestApp(); });
after(async () => { await app.close(); await db.destroy(); });
async function account() { const result = await app.auth.provisionAccount({ email: `meals-${randomUUID()}@example.test` }); assert.ok(result.ok); return result.value.id; }

test("meal logging is additive, account-scoped and idempotent across simultaneous retries, removal and late replies", async () => {
  const id = await account(), other = await account(), requestId = randomUUID();
  const input = { accountId: id, date, requestId, meal: meal(), favorite: true };
  const results = await Promise.all([meals.log(input), meals.log(input)]); assert.ok(results.every(result => result.ok));
  let day = await scorecards.get({ accountId: id, date }); assert.ok(day.ok); assert.equal(day.value.scorecard.values.energy, 400); assert.equal(day.value.scorecard.values.protein, 40);
  const staleRevision = day.value.revision;
  const own = await meals.get({ accountId: id }); assert.ok(own.ok); assert.equal(own.value.entries.length, 1); assert.equal(own.value.favorites.length, 1);
  const isolated = await meals.get({ accountId: other }); assert.ok(isolated.ok); assert.deepEqual(isolated.value.entries, []); assert.deepEqual(isolated.value.favorites, []);
  const changedRetry = await meals.log({ ...input, meal: { ...meal(), name: "Different meal" } }); assert.ok(!changedRetry.ok && changedRetry.error.code === "conflict");
  assert.ok((await meals.remove({ accountId: other, id: requestId, date })).ok);
  assert.ok((await meals.log({ ...input, requestId: randomUUID(), favorite: false })).ok);
  day = await scorecards.get({ accountId: id, date }); assert.ok(day.ok); assert.equal(day.value.scorecard.values.energy, 800);
  assert.ok(!(await scorecards.save({ accountId: id, date, revision: staleRevision, scorecard: day.value.scorecard })).ok);
  const removals = await Promise.all([meals.remove({ accountId: id, id: requestId, date }), meals.remove({ accountId: id, id: requestId, date })]); assert.ok(removals.every(result => result.ok));
  assert.ok((await meals.log(input)).ok); // A late retry cannot resurrect a removed entry.
  day = await scorecards.get({ accountId: id, date }); assert.ok(day.ok); assert.equal(day.value.scorecard.values.energy, 400); assert.equal(day.value.scorecard.values.protein, 40);
  const after = await meals.get({ accountId: id }); assert.ok(after.ok); assert.equal(after.value.entries.length, 1); assert.equal(after.value.favorites.length, 1);
});

test("meal and scorecard writes roll back together and nutrition totals preserve manual edits", async () => {
  const id = await account(), first = await scorecards.get({ accountId: id, date }); assert.ok(first.ok);
  const saved = await scorecards.save({ accountId: id, date, revision: 0, scorecard: { ...first.value.scorecard, values: { ...first.value.scorecard.values, energy: 9900, protein: 100 } } }); assert.ok(saved.ok);
  const rejected = await meals.log({ accountId: id, date, requestId: randomUUID(), meal: meal(), favorite: true }); assert.ok(!rejected.ok);
  const state = await meals.get({ accountId: id }); assert.ok(state.ok); assert.equal(state.value.entries.length, 0); assert.equal(state.value.favorites.length, 0);
  const day = await scorecards.get({ accountId: id, date }); assert.ok(day.ok); assert.equal(day.value.scorecard.values.energy, 9900); assert.equal(day.value.revision, 1);
  await scorecards.save({ accountId: id, date, revision: 1, scorecard: { ...day.value.scorecard, values: { ...day.value.scorecard.values, energy: 1000 } } });
  const requestId = randomUUID(); assert.ok((await meals.log({ accountId: id, date, requestId, meal: meal(), favorite: false })).ok);
  const logged = await scorecards.get({ accountId: id, date }); assert.ok(logged.ok); assert.equal(logged.value.scorecard.values.energy, 1400);
  assert.ok((await meals.remove({ accountId: id, id: requestId, date })).ok);
  const removed = await scorecards.get({ accountId: id, date }); assert.ok(removed.ok); assert.equal(removed.value.scorecard.values.energy, 1000);
  assert.equal(mealTotals(meal()).fibre, null);
});

test("analysis requires configuration and enforces a persistent per-client allowance", async () => {
  const id = await account(), input = { accountId: id, meal: { description: "Chicken and rice", photos: [] } };
  const unavailable = await meals.analyze(input); assert.ok(!unavailable.ok && unavailable.error.code === "not_configured");
  let calls = 0;
  const analyzer: MealAnalyzer = { available: true, analyze: async () => { calls++; return { ok: true, value: meal() }; } };
  const enabled = createMeals({ db, profiles, analyzer });
  for (let i = 0; i < 10; i++) assert.ok((await enabled.analyze(input)).ok);
  const limited = await enabled.analyze(input); assert.ok(!limited.ok && limited.error.code === "rate_limited"); assert.equal(calls, 10);
});

test("analysis leases prevent overlapping calls and are released after provider failure", async () => {
  const ids = await Promise.all([account(), account(), account()]);
  let release: (() => void) | undefined, entered: (() => void) | undefined;
  const wait = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  const analyzer: MealAnalyzer = { available: true, analyze: async () => { entered?.(); await wait; return { ok: false, error: { code: "unavailable", message: "Test provider failed" } }; } };
  const enabled = createMeals({ db, profiles, analyzer }), payload = { description: "Rice", photos: [] };
  const first = enabled.analyze({ accountId: ids[0]!, meal: payload }); await started;
  const overlap = await enabled.analyze({ accountId: ids[0]!, meal: payload }); assert.ok(!overlap.ok && overlap.error.code === "rate_limited");
  let secondEntered: (() => void) | undefined;
  const secondStarted = new Promise<void>(resolve => { secondEntered = resolve; });
  const secondService = createMeals({ db, profiles, analyzer: { available: true, analyze: async () => { secondEntered?.(); await wait; return { ok: true, value: meal() }; } } });
  const second = secondService.analyze({ accountId: ids[1]!, meal: payload }); await secondStarted;
  const third = await enabled.analyze({ accountId: ids[2]!, meal: payload }); assert.ok(!third.ok && third.error.code === "rate_limited");
  release?.(); await Promise.all([first, second]);
  const retry = await enabled.analyze({ accountId: ids[0]!, meal: payload }); assert.ok(!retry.ok && retry.error.code === "unavailable");
});
