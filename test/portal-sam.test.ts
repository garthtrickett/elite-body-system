import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { acceptDelivery, initialDelivery, deliveryNavigation } from "../src/features/delivery/browser-model.ts";
import type { ClientDetail } from "../src/features/delivery/contracts.ts";
import { acceptManagement, initialManagement, managementNavigation } from "../src/features/sales/management-model.ts";
import { acceptPublic, initialPublic } from "../src/features/sales/public-model.ts";
import { DEFAULT_SETTINGS } from "../src/features/sales/contracts.ts";
import type { ManagementSnapshot, PublicSnapshot } from "../src/features/sales/contracts.ts";
import { acceptMaster } from "../src/features/auth/master-browser.ts";
const detail: ClientDetail = { client: { id: randomUUID(), email: "client@example.test", name: "Client", membership: { level: "individual", active: true, revision: 1 }, profileCompleted: true, lastCheckin: null, pendingCheckins: 0, unread: 1 }, goals: "", equipment: "", limitations: "", timezone: "UTC", checkins: [], nextCheckinCursor: null, workouts: [], adjustments: [], thread: { messages: [], nextCursor: null } };
function mentor() { let m = acceptDelivery(initialDelivery({ mentor: true, today: "2026-10-28" }), { kind: "select", clientId: detail.client.id }); assert.ok(m.pending); return acceptDelivery(m, { kind: "clientLoaded", id: m.pending.id, today: "2026-10-28", result: { ok: true, value: detail } }); }
const snapshot: ManagementSnapshot = { settings: DEFAULT_SETTINGS, revision: 1, callScript: [], mentorIntroScript: "", leads: [], hasMore: false, counts: { free_value: 0, applied: 0, call_booked: 0, follow_up: 0, won: 0, lost: 0 }, visits: { "free-value": 0, apply: 0, "book-call": 0, "client-stories": 0 }, slots: [] };
const publicSnapshot: PublicSnapshot = { settings: DEFAULT_SETTINGS, applied: true, subscribed: false, identified: true, booking: null, slots: [] };

test("Delivery retains uncertain sends, retries the same payload and ignores unrelated completions", () => {
  let m = acceptDelivery(mentor(), { kind: "tab", tab: "messages" }); m = acceptDelivery(m, { kind: "message", value: "A coaching response" });
  const requestId = randomUUID(); m = acceptDelivery(m, { kind: "send", requestId }); assert.ok(m.pending?.kind === "write"); const sent = m.pending;
  assert.equal(acceptDelivery(m, { kind: "rosterLoaded", id: sent.id, result: { ok: true, value: { clients: [], nextCursor: null, canManageMembership: false } } }), m);
  m = acceptDelivery(m, { kind: "written", id: sent.id, result: { ok: false, error: { code: "unavailable", message: "Lost response" } } }); assert.equal(deliveryNavigation(m).kind, "blocked"); assert.equal(m.message, "A coaching response");
  assert.equal(acceptDelivery(m, { kind: "message", value: "Changed" }), m); assert.equal(acceptDelivery(m, { kind: "tab", tab: "clients" }), m);
  m = acceptDelivery(m, { kind: "retry" }); assert.ok(m.pending?.kind === "write"); assert.deepEqual(m.pending.body, sent.body); assert.ok(m.pending.id > sent.id);
  m = acceptDelivery(m, { kind: "written", id: m.pending.id, result: { ok: true, value: { acknowledged: true } } }); assert.equal(m.message, ""); assert.equal(m.pending?.kind, "client");
});

test("membership and program drafts protect navigation and keep invalid prescriptions on screen", () => {
  let m = acceptDelivery(mentor(), { kind: "membership", level: "group", active: true }); assert.equal(deliveryNavigation(m).kind, "confirm");
  const blocked = acceptDelivery(m, { kind: "tab", tab: "clients" }); assert.equal(blocked.tab, m.tab); assert.match(blocked.error, /save/);
  m = acceptDelivery(m, { kind: "clear" }); m = acceptDelivery(m, { kind: "programField", field: "planKey", value: "2" }); m = acceptDelivery(m, { kind: "rule", id: "dbpress", field: "sets", value: "99" });
  m = acceptDelivery(m, { kind: "saveProgram", requestId: randomUUID() }); assert.equal(m.pending, undefined); assert.match(m.error, /sets/); assert.equal(m.program.rules.dbpress?.sets, "99");
});

test("member Community loads membership before posts and failed read receipts can retry", () => {
  let m = acceptDelivery(initialDelivery({ mentor: false, tab: "community", today: "2026-10-28" }), { kind: "started" }); assert.equal(m.pending?.kind, "member"); assert.ok(m.pending);
  m = acceptDelivery(m, { kind: "memberLoaded", id: m.pending.id, result: { ok: true, value: { membership: { level: "group", active: true, revision: 1 }, thread: { messages: [], nextCursor: null }, adjustments: [], coachingName: "EBS" } } }); assert.equal(m.pending?.kind, "community");
  const base = { ...mentor(), tab: "messages" as const, detail: { ...detail, thread: { messages: [{ id: randomUUID(), body: "Message", author: "Client", fromMentor: false, own: false, createdAt: "2026-10-28T10:00:00Z" }], nextCursor: null } } };
  m = acceptDelivery(base, { kind: "tab", tab: "messages" }); assert.ok(m.pending?.kind === "read"); m = acceptDelivery(m, { kind: "read", id: m.pending.id, accepted: false }); assert.equal(m.lastRead, "");
});

test("management protects drafts, correlates workspace replies and mounts Marketing after access", () => {
  let m = acceptManagement(initialManagement("marketing"), { kind: "started" }); assert.ok(m.pending);
  assert.equal(acceptManagement(m, { kind: "workspaceMounted", id: m.pending.id }), m);
  m = acceptManagement(m, { kind: "loaded", id: m.pending.id, result: { ok: true, value: snapshot } }); assert.ok(m.pending?.kind === "workspace"); assert.equal(m.pending.view, "marketing");
  m = acceptManagement(m, { kind: "workspaceMounted", id: m.pending.id }); m = acceptManagement(m, { kind: "settingsEdited", settings: { ...DEFAULT_SETTINGS, freeTitle: "Edited" } }); assert.equal(managementNavigation(m).kind, "confirm");
  const refresh = acceptManagement(m, { kind: "started" }); assert.equal(refresh.pending, undefined); assert.equal(refresh.draft?.freeTitle, "Edited");
});

test("public sales only navigates after acknowledged application or booking and never on stale reply", () => {
  let m = acceptPublic(initialPublic("apply"), { kind: "submit", action: "apply" }); assert.ok(m.pending);
  assert.equal(acceptPublic(m, { kind: "navigated", id: m.pending.id }), m);
  m = acceptPublic(m, { kind: "finished", id: m.pending.id, result: { ok: true, value: publicSnapshot } }); assert.ok(m.pending?.kind === "navigate"); assert.equal(m.pending.href, "/book-call");
  assert.equal(acceptPublic(m, { kind: "finished", id: m.pending.id, result: { ok: true, value: publicSnapshot } }), m);
  const failed = acceptPublic(acceptPublic(initialPublic("apply"), { kind: "submit", action: "apply" }), { kind: "finished", id: 1, result: { ok: false, error: { code: "unavailable", message: "Retry" } } }); assert.equal(failed.pending, undefined); assert.equal(failed.busy, false);
});

test("master sign-in rejects stale or wrong-kind effects and sends only the username", () => {
  let m = acceptMaster({ username: "harrybaldwin", serial: 0, pending: undefined, message: "", error: "" }, { kind: "submit" }); assert.ok(m.pending?.kind === "signIn"); assert.equal(m.pending.username, "harrybaldwin");
  assert.equal(acceptMaster(m, { kind: "navigated", id: m.pending.id }), m);
  m = acceptMaster(m, { kind: "completed", id: m.pending.id, result: { ok: true, value: { signedIn: false, message: "Check your email" } } }); assert.equal(m.pending, undefined); assert.equal(m.message, "Check your email");
});
