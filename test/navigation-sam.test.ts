import test from "node:test";
import assert from "node:assert/strict";
import { initialNavigation, acceptNavigation } from "../src/shared/navigation-model.ts";
import { initialTrainingModel, acceptTrainingProposal, trainingNavigation, emptyWorkout } from "../src/features/training/browser.ts";
import { initialLearningModel, learningNavigation } from "../src/features/learning/browser.ts";
import { initialMealModel, mealsNavigation } from "../src/features/meals/browser.ts";
import { initialScorecardModel, scorecardNavigation } from "../src/features/scorecard/browser.ts";
import { initialOnboardingModel, onboardingNavigation } from "../src/features/onboarding/browser.ts";
import { createSamRuntime } from "../src/shared/sam-runtime.ts";
import { routeDelay } from "../src/shared/browser-delay.ts";

const home = { href: "/", page: "scorecard", accountId: "fixture" } as const;
test("route acceptance correlates resolution and authorization; cancellation/failure retain URL and retry target", () => {
  const initial = initialNavigation(home);
  const loading = acceptNavigation(initial, { kind: "requested", target: { href: "/training", index: 2 } });
  assert.equal(initial.pending, undefined);
  assert.equal(acceptNavigation(loading, { kind: "resolved", id: 999, route: home }), loading);
  const authorizing = acceptNavigation(loading, { kind: "resolved", id: loading.sequence, route: { ...home, href: "/training", page: "training" } });
  assert.equal(authorizing.current, home);
  const cancelled = acceptNavigation(authorizing, { kind: "authorized", id: authorizing.sequence, accepted: false, message: "" });
  assert.equal(cancelled.current, home); assert.equal(cancelled.index, 0);
  const committed = acceptNavigation(authorizing, { kind: "authorized", id: authorizing.sequence, accepted: true, message: "" });
  assert.equal(committed.current.href, "/training"); assert.equal(committed.index, 2);
  assert.equal(acceptNavigation(committed, { kind: "authorized", id: authorizing.sequence, accepted: true, message: "" }), committed);
  const failed = acceptNavigation(loading, { kind: "failed", id: loading.sequence });
  assert.equal(failed.current, home); assert.deepEqual(failed.retry, { href: "/training", index: 2 });
  const superseded = acceptNavigation(authorizing, { kind: "requested", target: { href: "/meals" } });
  assert.equal(acceptNavigation(superseded, { kind: "authorized", id: authorizing.sequence, accepted: true, message: "" }), superseded);
  const abandoned = acceptNavigation(loading, { kind: "cancelled" });
  assert.equal(acceptNavigation(abandoned, { kind: "resolved", id: loading.sequence, route: home }), abandoned);
});

test("feature navigation policies preserve raw drafts, newer generations, pending writes and uncertain meal retries", () => {
  const training = initialTrainingModel({ now: 0 });
  for (const raw of ["oops", "1.5", "12"]) assert.equal(trainingNavigation({ ...training, drafts: { "wpullup:0:reps": raw } }).kind, "confirm");
  assert.equal(trainingNavigation({ ...training, generation: 3, saved: 2 }).kind, "confirm");
  assert.equal(trainingNavigation({ ...training, pending: { kind: "save", id: 1, revision: 0, workout: emptyWorkout({ date: "2026-10-01", planKey: 0 }), generation: 1, finish: false } }).kind, "blocked");
  assert.equal(trainingNavigation(acceptTrainingProposal(training, { kind: "clockTicked", now: 1000 })).kind, "ready");
  const learning = initialLearningModel();
  assert.equal(learningNavigation({ ...learning, mapGeneration: 3, mapSaved: 2 }).kind, "confirm");
  assert.equal(learningNavigation({ ...learning, episodeGeneration: 4, episodeSaved: 3 }).kind, "confirm");
  assert.equal(learningNavigation({ ...learning, pending: { kind: "readMap", id: 1 } }).kind, "blocked");
  const meals = initialMealModel();
  assert.equal(mealsNavigation({ ...meals, description: "Lunch" }).kind, "confirm");
  assert.equal(mealsNavigation({ ...meals, retry: { kind: "remove", id: 1, mealId: "fixture", date: "2026-10-01" } }).kind, "blocked");
  const scorecard = initialScorecardModel({ email: "fixture@example.test", busy: false, problem: "" });
  assert.equal(scorecardNavigation({ ...scorecard, drafts: { ...scorecard.drafts, energy: "invalid" } }).kind, "confirm");
  assert.equal(scorecardNavigation({ ...scorecard, profileUi: { ...scorecard.profileUi, targetDrafts: { ...scorecard.profileUi.targetDrafts, energy: "-" } } }).kind, "confirm");
  const onboarding = initialOnboardingModel();
  assert.equal(onboardingNavigation({ ...onboarding, dirty: true }).kind, "confirm");
});

test("route disposal prevents late presentations and cancels delayed effects", async () => {
  let complete: (value: number) => void = () => {}, presentations = 0;
  const runtime = createSamRuntime({ initial: 0, accept: (_: number, proposal: number) => proposal, represent: (model: number) => model,
    next: (model: number) => model === 1 ? { id: 1 } : undefined, present: () => { presentations++; },
    perform: () => new Promise<number>(resolve => { complete = resolve; }), failed: () => 3 });
  runtime.propose(1); await Promise.resolve(); runtime.dispose(); complete(2); await new Promise(resolve => setImmediate(resolve));
  assert.equal(runtime.getModel(), 1); assert.equal(presentations, 2);
  const scope = new AbortController(), delayed = routeDelay(10000, scope.signal); scope.abort(); await assert.rejects(delayed, /disposed/);
});
