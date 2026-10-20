import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptAuthUiProposal as accept, initialAuthUiModel as initial, representAuthUi,
  nextAuthUiAction, createAuthUiRuntime } from "../src/features/auth/browser.ts";
import type { AuthUiEffect, AuthUiProposal, AuthUiState } from "../src/features/auth/browser.ts";
import { LINK_ACKNOWLEDGEMENT } from "../src/features/auth/index.ts";

const account = Object.freeze({ id: "test-account", email: "member@example.test" });
const accountResult = { ok: true, value: account } as const;
const acknowledged = { ok: true, value: { message: LINK_ACKNOWLEDGEMENT } } as const;
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test("SAM acceptance is pure; state representation and next-action selection derive from its immutable model", () => {
  const before = Object.freeze(initial("request"));
  const edited = accept(before, { kind: "emailChanged", email: "member@EXAMPLE.TEST" });
  const pending = Object.freeze(accept(Object.freeze(edited), { kind: "linkRequested" }));
  assert.equal(before.email, "");
  assert.equal(edited.pending, undefined);
  assert.deepEqual(nextAuthUiAction(pending), { kind: "request", id: 1, email: "member@example.test" });
  assert.equal(representAuthUi(pending).busy, true);
  assert.equal(representAuthUi(pending).busyLabel, "Sending your link…");
  assert.equal(accept(pending, { kind: "emailChanged", email: "different@example.test" }), pending);
  assert.equal(accept(pending, { kind: "linkRequested" }), pending);
  const completed = accept(pending, { kind: "requestCompleted", id: 1, result: acknowledged });
  assert.equal(representAuthUi(completed).busy, false);
  assert.equal(representAuthUi(completed).message, LINK_ACKNOWLEDGEMENT);
  assert.equal(nextAuthUiAction(completed), undefined);
  assert.equal(accept(initial("request"), { kind: "linkRequested" }).pending, undefined);
});

test("inspection cannot sign in: only an explicit accepted confirmation followed by its correlated result navigates", () => {
  const started = accept(initial("confirm"), { kind: "started" });
  assert.deepEqual(nextAuthUiAction(started), { kind: "inspect", id: 1 });
  assert.equal(accept(started, { kind: "started" }), started);
  assert.equal(accept(started, { kind: "redemptionRequested" }), started);
  const inspected = accept(started, { kind: "inspectionCompleted", id: 1, result: accountResult });
  assert.equal(inspected.account, account);
  assert.equal(nextAuthUiAction(inspected), undefined);
  const redeeming = accept(inspected, { kind: "redemptionRequested" });
  assert.deepEqual(nextAuthUiAction(redeeming), { kind: "redeem", id: 2 });
  assert.equal(accept(redeeming, { kind: "inspectionCompleted", id: 1, result: accountResult }), redeeming);
  assert.equal(accept(redeeming, { kind: "sessionCompleted", id: 2, result: accountResult }), redeeming);
  const signedIn = accept(redeeming, { kind: "redemptionCompleted", id: 2, result: accountResult });
  assert.deepEqual(nextAuthUiAction(signedIn), { kind: "navigate", id: 3, to: "/" });
  assert.equal(accept(signedIn, { kind: "redemptionCompleted", id: 2, result: accountResult }), signedIn);
  assert.equal("token" in signedIn, false);
});

test("unavailable redemption can be retried; invalid links cannot retain a confirmable account", () => {
  const inspecting = accept(initial("confirm"), { kind: "started" });
  const inspected = accept(inspecting, { kind: "inspectionCompleted", id: 1, result: accountResult });
  const redeeming = accept(inspected, { kind: "redemptionRequested" });
  const unavailable = accept(redeeming, { kind: "redemptionCompleted", id: 2,
    result: { ok: false, error: { code: "unavailable" } } });
  assert.equal(unavailable.account, account);
  assert.equal(unavailable.pending, undefined);
  assert.match(unavailable.problem, /try again/);
  const retried = accept(unavailable, { kind: "redemptionRequested" });
  assert.deepEqual(nextAuthUiAction(retried), { kind: "redeem", id: 3 });
  const invalid = accept(retried, { kind: "redemptionCompleted", id: 3,
    result: { ok: false, error: { code: "invalid_link" } } });
  assert.equal(invalid.account, undefined);
  assert.equal(accept(invalid, { kind: "redemptionRequested" }), invalid);
});

test("session and sign-out outcomes use the same acceptor and schedule navigation only after success", () => {
  const loading = accept(initial("home"), { kind: "started" });
  assert.deepEqual(nextAuthUiAction(loading), { kind: "session", id: 1 });
  const denied = accept(loading, { kind: "sessionCompleted", id: 1,
    result: { ok: false, error: { code: "unauthenticated" } } });
  assert.deepEqual(nextAuthUiAction(denied), { kind: "navigate", id: 2, to: "/sign-in" });
  const loaded = accept(loading, { kind: "sessionCompleted", id: 1, result: accountResult });
  const signingOut = accept(loaded, { kind: "signOutRequested" });
  assert.deepEqual(nextAuthUiAction(signingOut), { kind: "signOut", id: 2 });
  assert.equal(accept(signingOut, { kind: "signOutRequested" }), signingOut);
  const failed = accept(signingOut, { kind: "effectFailed", id: 2 });
  assert.equal(failed.account, account);
  assert.equal(failed.pending, undefined);
  const signedOut = accept(signingOut, { kind: "signOutCompleted", id: 2,
    result: { ok: true, value: { signedOut: true } } });
  assert.deepEqual(nextAuthUiAction(signedOut), { kind: "navigate", id: 3, to: "/sign-in" });
});

test("headless SAM runtime presents accepted state before executing an effect and never dispatches it twice", async () => {
  const events: string[] = [];
  const completions = new Map<number, (proposal: AuthUiProposal) => void>();
  const runtime = createAuthUiRuntime({ mode: "request",
    present: state => { events.push(state.busy ? "present-busy" : "present-ready"); },
    perform: effect => {
      events.push(`perform-${effect.kind}`);
      return new Promise(resolve => { completions.set(effect.id, resolve); });
    },
  });
  runtime.propose({ kind: "started" });
  runtime.propose({ kind: "emailChanged", email: account.email });
  runtime.propose({ kind: "linkRequested" });
  runtime.propose({ kind: "linkRequested" });
  await tick();
  assert.equal(events.filter(event => event === "perform-request").length, 1);
  assert.ok(events.indexOf("present-busy") < events.indexOf("perform-request"));
  const finish = completions.get(1);
  assert.ok(finish);
  finish({ kind: "requestCompleted", id: 1, result: acknowledged });
  await tick();
  assert.equal(runtime.getModel().pending, undefined);
  assert.equal(runtime.getModel().message, LINK_ACKNOWLEDGEMENT);
  runtime.propose({ kind: "requestCompleted", id: 1, result: acknowledged });
  await tick();
  assert.equal(events.filter(event => event === "perform-request").length, 1);
  runtime.dispose();
});

test("effect exceptions become proposals and disposal rejects late completions without navigation", async () => {
  const states: AuthUiState[] = [];
  const failing = createAuthUiRuntime({ mode: "confirm", present: state => { states.push(state); },
    perform: async () => { throw new Error("transport detail must not escape"); } });
  failing.propose({ kind: "started" });
  await tick();
  assert.equal(states.at(-1)?.busy, false);
  assert.match(states.at(-1)?.problem ?? "", /temporarily unavailable/);
  const performed: AuthUiEffect[] = [];
  const runtime = createAuthUiRuntime({ mode: "confirm", present: () => {},
    perform: async effect => { performed.push(effect); return { kind: "inspectionCompleted", id: effect.id, result: accountResult }; } });
  runtime.propose({ kind: "started" });
  runtime.dispose();
  await tick();
  assert.equal(performed.length, 0);
  const snapshot = runtime.getModel();
  runtime.propose({ kind: "inspectionCompleted", id: 1, result: accountResult });
  assert.equal(runtime.getModel(), snapshot);
});

test("the preview alias schedules server authentication and accepts only its matching completion", () => {
  const edited = accept(initial("request"), { kind: "emailChanged", email: "harrybaldwin" });
  const pending = accept(edited, { kind: "linkRequested" }); assert.equal(pending.pending?.kind, "harryPreview");
  assert.equal(accept(pending, { kind: "previewCompleted", id: 0, result: accountResult }), pending);
  assert.equal(accept(pending, { kind: "redemptionCompleted", id: 1, result: accountResult }), pending);
  const completed = accept(pending, { kind: "previewCompleted", id: 1, result: accountResult }); assert.equal(completed.pending?.kind, "navigate");
  const rejected = accept(pending, { kind: "previewCompleted", id: 1, result: { ok: false, error: { code: "unauthenticated" } } }); assert.equal(rejected.pending, undefined); assert.match(rejected.problem, /unavailable/);
  const regular = accept(accept(initial("request"), { kind: "emailChanged", email: "harrybaldwin@example.test" }), { kind: "linkRequested" }); assert.equal(regular.pending?.kind, "request");
});
