import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptScorecardProposal, initialScorecardModel, createScorecardRuntime, hasUnsavedScorecard } from "../src/features/scorecard/browser.ts";
import { emptyProfile } from "../src/features/profile/browser.ts";
import { emptyScorecard } from "../src/features/scorecard/index.ts";
import type { SyncProposal, SyncEffect } from "../src/features/scorecard/browser.ts";

const account = { email: "sync@example.test", busy: false, problem: "" };
const loaded = () => ({ profile: { profile: emptyProfile(), revision: 0 }, day: { date: "2026-10-20", scorecard: emptyScorecard(), revision: 0 }, history: [] });
function initial() {
  const model = acceptScorecardProposal(initialScorecardModel(account), { kind: "started" });
  return acceptScorecardProposal(model, { kind: "clientLoaded", id: 1, result: { ok: true, value: loaded() } });
}

test("a save completion keeps newer edits and schedules the next revision exactly once", () => {
  let model = initial();
  model = acceptScorecardProposal(model, { kind: "metricChanged", metric: "energy", value: "2000" });
  model = acceptScorecardProposal(model, { kind: "metricCommitted", metric: "energy" });
  const pending = model.pending; assert.ok(pending?.kind === "saveDay");
  model = acceptScorecardProposal(model, { kind: "checkToggled", check: "focus" });
  const completion: SyncProposal = { kind: "daySaved", id: pending.id, result: { ok: true, value: { date: pending.date, scorecard: pending.scorecard, revision: 1 } } };
  model = acceptScorecardProposal(model, completion);
  assert.equal(model.day.checks.focus, true);
  assert.ok(model.pending?.kind === "saveDay");
  assert.equal(model.pending.revision, 1);
  assert.equal(model.pending.scorecard.checks.focus, true);
  assert.equal(acceptScorecardProposal(model, completion), model);
  assert.equal(acceptScorecardProposal(model, { kind: "profileSaved", id: model.pending.id, result: { ok: true, value: loaded().profile } }), model);
});

test("network failures retain edits until explicit retry; stale loads cannot replace a loaded day", () => {
  let model = initial();
  model = acceptScorecardProposal(model, { kind: "checkToggled", check: "focus" });
  const id = model.pending!.id;
  model = acceptScorecardProposal(model, { kind: "syncFailed", id });
  assert.equal(model.day.checks.focus, true);
  assert.equal(model.pending, undefined);
  assert.ok(model.syncError);
  const stale = acceptScorecardProposal(model, { kind: "clientLoaded", id: 1, result: { ok: true, value: loaded() } });
  assert.equal(stale, model);
  model = acceptScorecardProposal(model, { kind: "retrySync" });
  assert.ok(model.pending?.kind === "saveDay");
  assert.ok(model.pending.id > id);
});

test("runtime presents before effects, dispatches accepted effects once and ignores late completions after disposal", async () => {
  const events: string[] = [], effects: SyncEffect[] = [];
  let complete: ((value: SyncProposal) => void) | undefined;
  const runtime = createScorecardRuntime({ account, present: state => { events.push(state.pending ? "busy" : "present"); }, perform: async effect => {
    events.push("effect"); effects.push(effect); return new Promise(resolve => { complete = resolve; });
  } });
  runtime.propose({ kind: "started" }); runtime.propose({ kind: "started" });
  await Promise.resolve();
  assert.deepEqual(events.slice(-3), ["busy", "busy", "effect"]);
  assert.equal(effects.length, 1);
  runtime.dispose();
  complete?.({ kind: "clientLoaded", id: 1, result: { ok: true, value: loaded() } });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(runtime.getModel().loaded, false);
});

test("day rollover waits for in-flight edits, then loads the new client day", () => {
  let model = acceptScorecardProposal(initial(), { kind: "panelClosed" });
  model = acceptScorecardProposal(model, { kind: "metricChanged", metric: "water", value: "3" });
  model = acceptScorecardProposal(model, { kind: "metricCommitted", metric: "water" });
  const pending = model.pending; assert.ok(pending?.kind === "saveDay");
  model = acceptScorecardProposal(model, { kind: "dayObserved", date: "2026-10-21" });
  assert.equal(model.pending?.kind, "saveDay");
  model = acceptScorecardProposal(model, { kind: "daySaved", id: pending.id, result: { ok: true, value: { date: pending.date, scorecard: pending.scorecard, revision: 1 } } });
  assert.equal(model.pending?.kind, "load"); assert.equal(model.loaded, false);
});

test("a requested account panel opens after loading once and setup review starts at the beginning", () => {
  const value = { ...loaded(), profile: { revision: 1, profile: { ...emptyProfile(), completed: true, setupStep: 33 } } };
  for (const panel of ["profile", "setup"] as const) {
    let model = acceptScorecardProposal(initialScorecardModel(account, panel), { kind: "started" });
    assert.equal(model.panel, undefined);
    const completion = { kind: "clientLoaded", id: 1, result: { ok: true, value } } as const;
    assert.equal(acceptScorecardProposal(model, { ...completion, id: 999 }), model);
    model = acceptScorecardProposal(model, completion);
    assert.equal(model.panel, panel);
    assert.equal(model.launchPanel, undefined);
    assert.equal(model.profileUi.draft.setupStep, panel === "setup" ? 0 : 33);
    model = acceptScorecardProposal(model, { kind: "panelClosed" });
    model = acceptScorecardProposal(model, { kind: "reloadClient" });
    model = acceptScorecardProposal(model, { ...completion, id: model.pending!.id });
    assert.equal(model.panel, undefined);
  }
});

test("unsaved protection includes profile fields, numeric targets, metric text and an unadded goal", () => {
  const clean = initial(); assert.equal(hasUnsavedScorecard(clean), false);
  assert.equal(hasUnsavedScorecard(acceptScorecardProposal(clean, { kind: "profileProposed", proposal: { kind: "targetChanged", field: "energy", value: "2417" } })), true);
  assert.equal(hasUnsavedScorecard(acceptScorecardProposal(clean, { kind: "profileProposed", proposal: { kind: "fieldChanged", field: "name", value: "An unsaved name" } })), true);
  assert.equal(hasUnsavedScorecard(acceptScorecardProposal(clean, { kind: "metricChanged", metric: "steps", value: "invalid draft" })), true);
  assert.equal(hasUnsavedScorecard(acceptScorecardProposal(clean, { kind: "goalDraftChanged", value: "An unadded goal" })), true);
});

test("sign-out confirmation protects the session and restores the unload guard after failure", () => {
  const edited = acceptScorecardProposal(initial(), { kind: "goalDraftChanged", value: "Keep this goal" });
  const signing = acceptScorecardProposal(edited, { kind: "signOutRequested" }); assert.ok(signing.pending?.kind === "signOut"); assert.equal(signing.pending.confirm, true);
  const cancelled = acceptScorecardProposal(signing, { kind: "signOutConfirmed", id: signing.pending.id, accepted: false });
  assert.equal(cancelled.exiting, false); assert.equal(cancelled.goalDraft, edited.goalDraft);
  const next = acceptScorecardProposal(cancelled, { kind: "signOutRequested" });
  const accepted = acceptScorecardProposal(next, { kind: "signOutConfirmed", id: next.pending!.id, accepted: true }); assert.equal(accepted.exiting, true);
  const failed = acceptScorecardProposal(accepted, { kind: "accountChanged", account: { ...account, problem: "Sign-out failed" } }); assert.equal(failed.exiting, false);
});

test("completed v2 setup navigation selects the eight-section flow for both panels and launch URLs", () => {
  const value = { ...loaded(), profile: { revision: 1, profile: { ...emptyProfile(), completed: true, onboardingVersion: "harry-v2" as const } } };
  let model = acceptScorecardProposal(initialScorecardModel(account, "setup"), { kind: "started" });
  model = acceptScorecardProposal(model, { kind: "clientLoaded", id: model.pending!.id, result: { ok: true, value } });
  assert.ok(model.pending?.kind === "navigate"); assert.equal(model.pending.href, "/onboarding"); assert.equal(model.panel, undefined); assert.equal(hasUnsavedScorecard(model), false);
  const loadedModel = acceptScorecardProposal(acceptScorecardProposal(initialScorecardModel(account), { kind: "started" }), { kind: "clientLoaded", id: 1, result: { ok: true, value } });
  assert.equal(acceptScorecardProposal(loadedModel, { kind: "panelOpened", panel: "setup" }).pending?.kind, "navigate");
});

test("saved-version reload asks before replacing drafts and ignores stale confirmation", () => {
  const edited = { ...acceptScorecardProposal(initial(), { kind: "metricChanged", metric: "steps", value: "5123" }), syncError: "Save failed" };
  const pending = acceptScorecardProposal(edited, { kind: "reloadClient" }); assert.ok(pending.pending?.kind === "confirmReload");
  assert.equal(acceptScorecardProposal(pending, { kind: "reloadConfirmed", id: 999, discard: true }), pending);
  const kept = acceptScorecardProposal(pending, { kind: "reloadConfirmed", id: pending.pending.id, discard: false });
  assert.equal(kept.drafts.steps, "5123"); assert.equal(kept.syncError, "Save failed"); assert.equal(kept.loaded, true);
  const retry = acceptScorecardProposal(kept, { kind: "reloadClient" });
  assert.equal(acceptScorecardProposal(retry, { kind: "reloadConfirmed", id: retry.pending!.id, discard: true }).pending?.kind, "load");
});

test("day rollover keeps an unsaved profile draft until it can be saved", () => {
  const clean = { ...initial(), panel: undefined };
  const edited = acceptScorecardProposal(clean, { kind: "profileProposed", proposal: { kind: "targetChanged", field: "energy", value: "2417" } });
  const observed = acceptScorecardProposal(edited, { kind: "dayObserved", date: "2026-10-21" });
  assert.equal(observed.pending, undefined); assert.equal(observed.profileUi.targetDrafts.energy, "2417");
});

test("blurring a committed metric does not start a duplicate save or interrupt navigation", () => {
  let model = acceptScorecardProposal(initial(), { kind: "metricChanged", metric: "steps", value: "5123" });
  model = acceptScorecardProposal(model, { kind: "metricCommitted", metric: "steps" }); const effect = model.pending; assert.ok(effect?.kind === "saveDay");
  model = acceptScorecardProposal(model, { kind: "daySaved", id: effect.id, result: { ok: true, value: { date: effect.date, scorecard: effect.scorecard, revision: 1 } } });
  const blurred = acceptScorecardProposal(model, { kind: "metricCommitted", metric: "steps" });
  assert.equal(blurred.pending, undefined); assert.equal(blurred.generation, model.generation);
});
