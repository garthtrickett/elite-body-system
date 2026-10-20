import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/platform/database/connection.ts";
import { createProfiles, createPostgresProfileStore, emptyProfile } from "../src/features/profile/index.ts";
import { createTraining, emptyWorkout, exercisesFor, workoutStats } from "../src/features/training/index.ts";
import { startTestApp, testDatabaseUrl } from "./support/app.ts";
import { createScorecards } from "../src/features/scorecard/index.ts";
import { completedProfile } from "./support/client.ts";

const db = createDatabase(testDatabaseUrl());
const profiles = createProfiles({ store: createPostgresProfileStore(db), now: () => new Date("2026-10-20T12:00:00Z") });
const training = createTraining({ db, profiles, now: () => Date.parse("2026-10-20T12:00:00Z") });
let app: Awaited<ReturnType<typeof startTestApp>>;
before(async () => { app = await startTestApp(); });
after(async () => { await app.close(); await db.destroy(); });
async function account() {
  const result = await app.auth.provisionAccount({ email: `training-${randomUUID()}@example.test` }); assert.ok(result.ok); return result.value.id;
}

test("training follows chosen days and persists sets, swaps, notes and timer deadlines per account", async () => {
  const id = await account(), other = await account();
  assert.ok((await profiles.save({ accountId: id, revision: 0, profile: completedProfile() })).ok);
  const first = await training.get({ accountId: id, date: "2026-10-20" }); assert.ok(first.ok);
  assert.equal(first.value.workout.planKey, 2);
  const workout = { ...first.value.workout, swaps: { dbpress: true }, sets: { landpress: [{ kg: 20, reps: 10, done: true }] }, notes: { landpress: "Controlled reps" }, restUntil: Date.parse("2026-10-20T12:01:30Z") };
  const saved = await training.save({ accountId: id, revision: 0, workout }); assert.ok(saved.ok);
  assert.equal(saved.value.workout.startedAt, Date.parse("2026-10-20T12:00:00Z"));
  assert.equal(exercisesFor(saved.value.workout)[0]?.name, "Landmine Press");
  const reloaded = await training.get({ accountId: id, date: workout.date }); assert.ok(reloaded.ok);
  assert.deepEqual(reloaded.value.workout, saved.value.workout);
  const isolated = await training.get({ accountId: other, date: workout.date }); assert.ok(isolated.ok);
  assert.equal(isolated.value.revision, 0); assert.deepEqual(isolated.value.history, []);
  const simultaneous = await Promise.all([training.save({ accountId: id, revision: 1, workout }), training.save({ accountId: id, revision: 1, workout })]);
  assert.equal(simultaneous.filter(value => value.ok).length, 1);
  assert.ok(simultaneous.some(value => !value.ok && value.error.code === "conflict"));
});

test("health/setup holds and future dates are enforced by the core operations", async () => {
  const id = await account();
  const blocked = await training.save({ accountId: id, revision: 0, workout: emptyWorkout({ date: "2026-10-20", planKey: 2 }) });
  assert.ok(!blocked.ok); assert.equal(blocked.error.code, "forbidden");
  const flagged = { ...completedProfile(), health: { answers: [true, false, false, false, false, false, false], details: "A condition", clearance: false } };
  const profile = await profiles.save({ accountId: id, revision: 0, profile: flagged }); assert.ok(profile.ok);
  const held = await training.save({ accountId: id, revision: 0, workout: emptyWorkout({ date: "2026-10-20", planKey: 2 }) });
  assert.ok(!held.ok); assert.equal(held.error.code, "forbidden");
  assert.ok((await profiles.save({ accountId: id, revision: 1, profile: { ...flagged, health: { ...flagged.health, clearance: true } } })).ok);
  const future = await training.get({ accountId: id, date: "2026-10-21" }); assert.ok(future.ok); assert.equal(future.value.readOnly, true);
  const forbidden = await training.save({ accountId: id, revision: 0, workout: future.value.workout }); assert.ok(!forbidden.ok); assert.equal(forbidden.error.code, "invalid_input");
  const empty = await training.save({ accountId: id, revision: 0, workout: emptyWorkout({ date: "2026-10-20", planKey: 2 }), finish: true }); assert.ok(!empty.ok);
  assert.equal(empty.error.code, "invalid_input");
});

test("completed sessions preserve history and PR calculations compare equivalent exercises", async () => {
  const id = await account();
  await profiles.save({ accountId: id, revision: 0, profile: completedProfile() });
  const previous = { ...emptyWorkout({ date: "2026-10-13", planKey: 2 }), sets: { dbpress: [{ kg: 20, reps: 10, done: true }] } };
  const old = await training.save({ accountId: id, revision: 0, workout: previous, finish: true }); assert.ok(old.ok);
  const current = { ...emptyWorkout({ date: "2026-10-20", planKey: 2 }), sets: { dbpress: [{ kg: 22, reps: 10, done: true }] } };
  const saved = await training.save({ accountId: id, revision: 0, workout: current, finish: true }); assert.ok(saved.ok);
  assert.ok(saved.value.workout.finishedAt);
  const historicalDay = await createScorecards(db).get({ accountId: id, date: "2026-10-13" }); assert.ok(historicalDay.ok); assert.equal(historicalDay.value.scorecard.checks.training, true);
  const stats = workoutStats({ workout: saved.value.workout, history: saved.value.history });
  assert.equal(stats.sets, 1); assert.equal(stats.volume, 220); assert.deepEqual(stats.records, ["dbpress:0"]);
  assert.equal(saved.value.history.filter(workout => workout.finishedAt).length, 2);
  const cleared = await training.save({ accountId: id, revision: 1, workout: { ...current, sets: {} } }); assert.ok(!cleared.ok && cleared.error.code === "invalid_input");
  const malformed = await training.save({ accountId: id, revision: 1, workout: { ...current, sets: { dbpress: [{ kg: -1, reps: 10, done: true }] } } }); assert.ok(!malformed.ok);
  assert.equal(malformed.error.code, "invalid_input");
  assert.equal((await profiles.save({ accountId: id, revision: 1, profile: { ...emptyProfile(), completed: true } })).ok, false);
});
