import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/platform/database/connection.ts";
import type { AccountsId } from "../src/platform/database/generated/public/Accounts.ts";
import { createPostgresProfileStore } from "../src/features/profile/index.ts";
import { createWeeklyCheckins, createMentorCheckins } from "../src/features/checkins/index.ts";
import { blankAnswers, dateShift, parseSnapshot } from "../src/features/checkins/data.ts";
import { entryWeek, storedJson } from "../src/features/checkins/persistence.ts";
import { checkinEntry, completeAnswers } from "./support/checkins.ts";
import { completedProfile } from "./support/client.ts";
import { startTestApp, testDatabaseUrl } from "./support/app.ts";
const db = createDatabase(testDatabaseUrl()), ids: AccountsId[] = [];
let app: Awaited<ReturnType<typeof startTestApp>>;
before(async () => { app = await startTestApp({ checkinsEnabled: true }); });
after(async () => { await db.deleteFrom("accounts").where("id", "in", ids).execute(); await app.close(); await db.destroy(); });
async function account() {
  const provisioned = await app.auth.provisionAccount({ email: `checkin-${randomUUID()}@example.test` }); assert.ok(provisioned.ok);
  const id = provisioned.value.id as AccountsId; ids.push(id);
  assert.ok(await createPostgresProfileStore(db).write({ accountId: id, revision: 0, profile: completedProfile({ startDate: "2026-01-01" }) }));
  return id;
}
const core = (overrides: Partial<Parameters<typeof createWeeklyCheckins>[0]> = {}) => createWeeklyCheckins({ db, enabled: true, hour: 9, now: () => new Date("2026-10-24T10:00:00Z"), ...overrides });

test("partial drafts preserve raw numbers without unlocking; complete submission is immutable and retry-safe", async () => {
  const accountId = await account(), other = await account(), checkins = core();
  const first = await checkins.get({ accountId }); assert.ok(first.ok); assert.equal(first.value.week, "2026-10-24"); assert.equal(first.value.required, true);
  const partial = await checkins.save({ accountId, week: first.value.week, revision: 0, answers: blankAnswers(first.value.week), rawMeasurements: { weight: "2", waist: "", muscle: "" }, submit: false });
  assert.ok(partial.ok); assert.equal(partial.value.current?.answers.data.weight, null); assert.equal(partial.value.current?.rawMeasurements.weight, "2"); assert.equal(partial.value.required, true); assert.ok(parseSnapshot(partial.value));
  const incomplete = await checkins.save({ accountId, week: first.value.week, revision: 1, answers: blankAnswers(first.value.week), submit: true }); assert.ok(!incomplete.ok); assert.equal(incomplete.error.code, "invalid_input");
  const submitted = await checkins.save({ accountId, week: first.value.week, revision: 1, answers: completeAnswers(), submit: true }); assert.ok(submitted.ok); assert.equal(submitted.value.required, false); assert.ok(submitted.value.current?.submittedAt); assert.equal(submitted.value.history.length, 1);
  const retried = await checkins.save({ accountId, week: first.value.week, revision: 1, answers: completeAnswers(), submit: true }); assert.ok(retried.ok); assert.equal(retried.value.current?.revision, 2);
  const edit = await checkins.save({ accountId, week: first.value.week, revision: 2, answers: { ...completeAnswers(), wins: "Overwrite" }, submit: false }); assert.ok(!edit.ok); assert.equal(edit.error.code, "conflict");
  const isolation = await checkins.history({ accountId: other }); assert.ok(isolation.ok); assert.deepEqual(isolation.value.entries, []);
});

test("CAS rejects concurrent edits and Improved needs a single primary overload on completion", async () => {
  const accountId = await account(), checkins = core();
  const replies = await Promise.all(["first", "second"].map(wins => checkins.save({ accountId, week: "2026-10-24", revision: 0, answers: { ...blankAnswers("2026-10-24"), wins }, submit: false })));
  assert.equal(replies.filter(result => result.ok).length, 1); assert.equal(replies.filter(result => !result.ok && result.error.code === "conflict").length, 1);
  for (const progressiveOverload of [[], ["load", "range"]]) {
    const invalid = await checkins.save({ accountId, week: "2026-10-24", revision: 1, answers: { ...completeAnswers(), data: { ...completeAnswers().data, progressiveOverload } }, submit: true }); assert.ok(!invalid.ok); assert.equal(invalid.error.code, "invalid_input");
  }
});

test("enrolment persists through time-zone/profile changes and new weeks re-lock after restart", async () => {
  const accountId = await account(); let now = new Date("2026-10-24T10:00:00Z"); const checkins = core({ now: () => now });
  const saved = await checkins.save({ accountId, week: "2026-10-24", revision: 0, answers: completeAnswers(), submit: true }); assert.ok(saved.ok);
  assert.ok(await createPostgresProfileStore(db).write({ accountId, revision: 1, profile: completedProfile({ timezone: "Pacific/Honolulu", completed: false }) }));
  now = new Date("2026-10-31T09:00:00Z");
  const next = await core({ now: () => now }).get({ accountId }); assert.ok(next.ok); assert.equal(next.value.timezone, "UTC"); assert.equal(next.value.week, "2026-10-31"); assert.equal(next.value.required, true); assert.equal(next.value.history.length, 1);
  const paused = await core({ enabled: false }).access({ accountId }); assert.deepEqual(paused, { ok: true, value: { required: false } });
  const prerequisite = await core({ ready: async () => false }).get({ accountId }); assert.ok(prerequisite.ok); assert.equal(prerequisite.value.enrolled, false);
});

test("future Saturday and readiness cannot be bypassed by JSON, and only the configured preview identity is exempt", async () => {
  const accountId = await account(), other = await account();
  const early = core({ now: () => new Date("2026-10-23T10:00:00Z") }); const snapshot = await early.get({ accountId }); assert.ok(snapshot.ok); assert.equal(snapshot.value.due, false);
  const blocked = await early.save({ accountId, week: snapshot.value.week, revision: 0, answers: completeAnswers(), submit: true }); assert.ok(!blocked.ok); assert.equal(blocked.error.code, "conflict");
  const email = await db.selectFrom("accounts").select("email").where("id", "=", accountId).executeTakeFirstOrThrow();
  const preview = core({ previewEmail: email.email }); const demo = await preview.get({ accountId }); assert.ok(demo.ok); assert.equal(demo.value.flowPreview, true); assert.equal(demo.value.required, false);
  const normal = await preview.get({ accountId: other }); assert.ok(normal.ok); assert.equal(normal.value.flowPreview, false); assert.equal(normal.value.required, true);
  assert.ok(!(await preview.save({ accountId, week: demo.value.week, revision: 0, answers: blankAnswers(demo.value.week), submit: true })).ok);
});

test("history pagination retains submitted records without drafts or cross-account leakage", async () => {
  const accountId = await account(); const entry = checkinEntry();
  await db.insertInto("weekly_checkins").values(Array.from({ length: 33 }, (_, index) => ({ account_id: accountId, week: entryWeek(dateShift(entry.week, -7 * index)), data: storedJson({ ...entry.answers, version: "body-v1", question: entry.question }), revision: 1, submitted_at: new Date("2026-10-24T10:00:00Z") }))).execute();
  const first = await core().history({ accountId }); assert.ok(first.ok); assert.equal(first.value.entries.length, 26); assert.ok(first.value.nextCursor);
  const second = await core().history({ accountId, before: first.value.nextCursor }); assert.ok(second.ok); assert.equal(second.value.entries.length, 7); assert.equal(second.value.nextCursor, null);
  assert.equal(new Set([...first.value.entries, ...second.value.entries].map(item => item.week)).size, 33);
});

test("coach queue is assignment-scoped; summaries cache and review removes queue entries without deleting client history", async () => {
  const actorId = await account(), clientId = await account(), outsider = await account(), checkins = core(); let calls = 0;
  const mentor = createMentorCheckins({ db, summarizer: { available: true, model: "test", summarize: async input => { calls++; assert.equal(input.entries.length, 1); return { ok: true, value: { wentWell: ["Training 8/10"], needsAttention: ["Recovery 6/10"] } }; } } });
  assert.ok(!(await mentor.queue({ actorId })).ok);
  await db.insertInto("performance_mentors").values({ account_id: actorId }).execute(); await db.insertInto("mentor_clients").values({ mentor_id: actorId, client_id: clientId }).execute();
  assert.ok((await checkins.save({ accountId: clientId, week: "2026-10-24", revision: 0, answers: completeAnswers(), submit: true })).ok);
  assert.ok((await checkins.save({ accountId: outsider, week: "2026-10-24", revision: 0, answers: completeAnswers(), submit: true })).ok);
  const queue = await mentor.queue({ actorId }); assert.ok(queue.ok); assert.equal(queue.value.total, 1); assert.equal(queue.value.items[0]?.clientId, clientId);
  assert.ok(!(await mentor.summary({ actorId, clientId: outsider, week: "2026-10-24" })).ok); assert.equal(calls, 0);
  assert.ok((await mentor.summary({ actorId, clientId, week: "2026-10-24" })).ok); assert.ok((await mentor.summary({ actorId, clientId, week: "2026-10-24" })).ok); assert.equal(calls, 1);
  const clientView = await checkins.get({ accountId: clientId }); assert.ok(clientView.ok); assert.doesNotMatch(JSON.stringify(clientView.value), /wentWell|needsAttention/);
  assert.ok(!(await mentor.review({ actorId, clientId, week: "2026-10-24", revision: 0 })).ok);
  assert.ok((await mentor.review({ actorId, clientId, week: "2026-10-24", revision: 1 })).ok); assert.ok((await mentor.review({ actorId, clientId, week: "2026-10-24", revision: 1 })).ok);
  const afterReview = await mentor.queue({ actorId }); assert.ok(afterReview.ok); assert.equal(afterReview.value.total, 0);
  const history = await mentor.history({ actorId, clientId }); assert.ok(history.ok); assert.ok(history.value.entries[0]?.reviewedAt); assert.equal(history.value.entries[0]?.entry.answers.wins, completeAnswers().wins);
  await db.deleteFrom("mentor_clients").where("mentor_id", "=", actorId).execute(); assert.ok(!(await mentor.history({ actorId, clientId })).ok);
});
