import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { createDatabase } from "../src/platform/database/connection.ts";
import type { AccountsId } from "../src/platform/database/generated/public/Accounts.ts";
import { createDelivery } from "../src/features/delivery/index.ts";
import { createMentorCheckins, createWeeklyCheckins, createMentorSummarizer } from "../src/features/checkins/index.ts";
import { createProfiles, createPostgresProfileStore } from "../src/features/profile/index.ts";
import { createTraining, createProgramming } from "../src/features/training/index.ts";
import { parseProgramRules, baseExercises } from "../src/features/training/program-rules.ts";
import { completeAnswers } from "./support/checkins.ts";
import { completedProfile } from "./support/client.ts";
import { startTestApp, testDatabaseUrl } from "./support/app.ts";
const db = createDatabase(testDatabaseUrl()), ids: AccountsId[] = [];
let app: Awaited<ReturnType<typeof startTestApp>>, delivery: ReturnType<typeof createDelivery>;
let mentor: AccountsId, client: AccountsId, other: AccountsId, manager: AccountsId;
const checkins = createMentorCheckins({ db, summarizer: createMentorSummarizer({}) });
async function account() { const result = await app.auth.provisionAccount({ email: `delivery-${randomUUID()}@example.test` }); assert.ok(result.ok); const id = result.value.id as AccountsId; ids.push(id); return id; }
before(async () => { app = await startTestApp(); delivery = createDelivery({ db, checkins, auth: app.auth }); mentor = await account(); client = await account(); other = await account(); manager = await account(); await db.insertInto("performance_mentors").values([{ account_id: mentor }, { account_id: manager, all_clients: true }]).execute(); await db.insertInto("business_managers").values({ account_id: manager }).execute(); await db.insertInto("mentor_clients").values({ mentor_id: mentor, client_id: client }).execute(); });
after(async () => { await db.deleteFrom("coaching_community_posts").where("author_id","in",ids).execute(); await db.deleteFrom("accounts").where("id", "in", ids).execute(); await app.close(); await db.destroy(); });
async function membership(clientId: string, level: "group" | "individual", active = true) { const current = await db.selectFrom("coaching_memberships").select("revision").where("client_id", "=", clientId as AccountsId).executeTakeFirst(); const result = await delivery.setMembership({ actorId: manager, clientId, level, active, revision: current?.revision ?? 0 }); assert.ok(result.ok); return result.value; }

test("Mentor roster respects selected or all-client scope and includes incomplete new accounts", async () => {
  const scoped = await delivery.clients({ actorId: mentor }); assert.ok(scoped.ok); assert.deepEqual(scoped.value.clients.map(c => c.id), [client]); assert.equal(scoped.value.canManageMembership, false);
  assert.ok(!(await delivery.client({ actorId: mentor, clientId: other })).ok);
  const otherAccount=await db.selectFrom("accounts").select("email").where("id","=",other).executeTakeFirstOrThrow();
  const all = await delivery.clients({ actorId: manager,search:otherAccount.email }); assert.ok(all.ok); assert.ok(all.value.clients.some(c => c.id === other)); assert.ok(all.value.canManageMembership);
  const incomplete = await delivery.client({ actorId: manager, clientId: other }); assert.ok(incomplete.ok); assert.equal(incomplete.value.timezone, "UTC"); assert.equal(incomplete.value.client.profileCompleted, false);
  assert.ok(!(await delivery.clients({ actorId: client })).ok);
});

test("member provisioning is explicit, idempotent, manager-only and never invents health clearance", async () => {
  const email = `delivery-added-${randomUUID()}@example.test`;
  assert.ok(!(await delivery.provisionMember({ actorId: mentor, email, level: "group" })).ok);
  const added = await delivery.provisionMember({ actorId: manager, email, level: "group" }); assert.ok(added.ok); ids.push(added.value.id as AccountsId);
  const repeated = await delivery.provisionMember({ actorId: manager, email, level: "individual" }); assert.ok(repeated.ok); assert.equal(repeated.value.id, added.value.id);
  const room = await delivery.member({ actorId: added.value.id }); assert.ok(room.ok); assert.equal(room.value.membership?.level, "group");
  const p = await db.selectFrom("client_profiles").select("data").where("account_id", "=", added.value.id as AccountsId).executeTakeFirst(); assert.equal(p, undefined);
  const assigned = await db.selectFrom("mentor_clients").select("client_id").where("mentor_id", "=", manager).where("client_id", "=", added.value.id as AccountsId).executeTakeFirst(); assert.ok(assigned);
});

test("individual messages are private, retry-safe, scope-checked and tracked as unread", async () => {
  await membership(client, "group");
  assert.ok(!(await delivery.sendMember({ actorId: client, requestId: randomUUID(), body: "Blocked group message" })).ok);
  await membership(client, "individual");
  const requestId = randomUUID(), body = "A question for my coach.";
  const sent = await Promise.all([delivery.sendMember({ actorId: client, requestId, body }), delivery.sendMember({ actorId: client, requestId, body })]); assert.ok(sent[0]!.ok && sent[1]!.ok); assert.equal(sent[0]!.value.id, sent[1]!.value.id);
  const conflicting = await delivery.sendMember({ actorId: client, requestId, body: "Different content" }); assert.ok(!conflicting.ok && conflicting.error.code === "conflict");
  const coach = await delivery.client({ actorId: mentor, clientId: client }); assert.ok(coach.ok); assert.equal(coach.value.client.unread, 1); assert.equal(coach.value.thread.messages.at(-1)?.body, body);
  assert.ok(!(await delivery.thread({ actorId: other, clientId: client, mentor: false })).ok);
  assert.ok((await delivery.read({ actorId: mentor, clientId: client, lastMessageId: sent[0]!.value.id, mentor: true })).ok);
  const seen = await delivery.client({ actorId: mentor, clientId: client }); assert.ok(seen.ok); assert.equal(seen.value.client.unread, 0);
  const reply = await delivery.sendMentor({ actorId: mentor, clientId: client, requestId: randomUUID(), body: "Coach reply" }); assert.ok(reply.ok);
  const member = await delivery.member({ actorId: client }); assert.ok(member.ok); assert.equal(member.value.thread.messages.at(-1)?.fromMentor, true);
  await db.deleteFrom("mentor_clients").where("mentor_id", "=", mentor).where("client_id", "=", client).execute();
  const revoked = await delivery.sendMentor({ actorId: mentor, clientId: client, requestId: randomUUID(), body: "Revoked" }); assert.ok(!revoked.ok && revoked.error.code === "forbidden");
  await db.insertInto("mentor_clients").values({ mentor_id: mentor, client_id: client }).execute();
});

test("community supports active group members without exposing email addresses", async () => {
  await membership(other, "group"); const requestId = randomUUID(), body = "A community update.";
  const posts = await Promise.all([delivery.post({ actorId: other, mentor: false, requestId, body }), delivery.post({ actorId: other, mentor: false, requestId, body })]); assert.ok(posts[0]!.ok && posts[1]!.ok); assert.equal(posts[0]!.value.id, posts[1]!.value.id);
  const member = await delivery.community({ actorId: other, mentor: false }); assert.ok(member.ok); assert.ok(member.value.messages.some(m => m.body === body)); assert.doesNotMatch(JSON.stringify(member.value), /@example\.test/);
  assert.ok((await delivery.community({ actorId: mentor, mentor: true })).ok);
  await membership(other, "group", false); assert.ok(!(await delivery.community({ actorId: other, mentor: false })).ok); assert.ok(!(await delivery.post({ actorId: other, mentor: false, requestId: randomUUID(), body: "Paused" })).ok);
});

test("all-client mentors receive and review submitted check-ins without deleting member history", async () => {
  const target = await account(); assert.ok(await createPostgresProfileStore(db).write({ accountId: target, revision: 0, profile: completedProfile({ startDate: "2026-01-01" }) }));
  const weekly = createWeeklyCheckins({ db, enabled: true, hour: 9, now: () => new Date("2026-10-24T10:00:00Z") }); assert.ok((await weekly.save({ accountId: target, week: "2026-10-24", revision: 0, answers: completeAnswers(), submit: true })).ok);
  const queue = await checkins.queue({ actorId: manager }); assert.ok(queue.ok); assert.ok(queue.value.items.some(i => i.clientId === target));
  assert.ok(!(await checkins.history({ actorId: mentor, clientId: target })).ok);
  assert.ok((await checkins.review({ actorId: manager, clientId: target, week: "2026-10-24", revision: 1 })).ok);
  const history = await weekly.history({ accountId: target }); assert.ok(history.ok); assert.equal(history.value.entries.length, 1);
});

test("program adjustments validate prescriptions, apply to new sessions and freeze logged history", async () => {
  const target = await account(), now = () => Date.parse("2026-10-20T12:00:00Z"), profiles = createProfiles({ store: createPostgresProfileStore(db), now: () => new Date(now()) });
  assert.ok((await profiles.save({ accountId: target, revision: 0, profile: completedProfile() })).ok);
  const training = createTraining({ db, profiles, now }), programming = createProgramming({ db });
  assert.equal(parseProgramRules({ planKey: 2, value: { dbpress: { sets: 11 } } }), undefined); assert.equal(parseProgramRules({ planKey: 2, value: { unknown: { sets: 2 } } }), undefined);
  const first = await training.get({ accountId: target, date: "2026-10-13" }); assert.ok(first.ok);
  assert.ok((await training.save({ accountId: target, revision: 0, workout: { ...first.value.workout, sets: { dbpress: [{ kg: 20, reps: 8, done: true }] } } })).ok);
  const request = { actorId: manager, clientId: target, requestId: randomUUID(), title: "Progression", instructions: "Maintain a controlled tempo.", effectiveFrom: "2026-10-01", planKey: 2, rules: { dbpress: { sets: 5, reps: "6", rest: 90 } } };
  const adjusted = await Promise.all([programming.adjust(request), programming.adjust(request)]); assert.ok(adjusted[0]!.ok && adjusted[1]!.ok); assert.equal(adjusted[0]!.value.id, adjusted[1]!.value.id);
  assert.ok(!(await programming.adjust({ ...request, rules: { dbpress: { sets: 4 } } })).ok);
  const current = await training.get({ accountId: target, date: "2026-10-20" }); assert.ok(current.ok); assert.equal(baseExercises(current.value.workout)[0]?.sets, 5);
  const historical = await training.get({ accountId: target, date: "2026-10-13" }); assert.ok(historical.ok); assert.equal(historical.value.workout.programRules, undefined);
  const forged = await training.save({ accountId: target, revision: 0, workout: { ...current.value.workout, programRules: { dbpress: { sets: 8 } } } }); assert.ok(!forged.ok && forged.error.code === "conflict");
  const logged = await training.save({ accountId: target, revision: 0, workout: { ...current.value.workout, sets: { dbpress: [{ kg: 22, reps: 6, done: true }] } } }); assert.ok(logged.ok);
  assert.ok((await programming.adjust({ ...request, requestId: randomUUID(), effectiveFrom: "2026-10-20", rules: { dbpress: { sets: 3 } } })).ok);
  const frozen = await training.get({ accountId: target, date: "2026-10-20" }); assert.ok(frozen.ok); assert.equal(frozen.value.workout.programRules?.dbpress?.sets, 5);
  assert.ok(!(await programming.adjust({ ...request, actorId: mentor, requestId: randomUUID() })).ok);
});

test("thread pagination preserves microsecond ordering and read acknowledgements never move backwards", async () => {
  const target = await account(); await membership(target, "individual");
  const one = await delivery.sendMentor({ actorId: manager, clientId: target, requestId: randomUUID(), body: "Earlier" }), two = await delivery.sendMentor({ actorId: manager, clientId: target, requestId: randomUUID(), body: "Later" }); assert.ok(one.ok && two.ok);
  await sql`update coaching_messages set created_at='2026-10-01T00:00:00.123456Z'::timestamptz where id=${two.value.id}::uuid`.execute(db); await sql`update coaching_messages set created_at='2026-10-01T00:00:00.123455Z'::timestamptz where id=${one.value.id}::uuid`.execute(db);
  const page = await delivery.thread({ actorId: target, clientId: target, mentor: false, before: two.value.id }); assert.ok(page.ok); assert.deepEqual(page.value.messages.map(m => m.id), [one.value.id]);
  await delivery.read({ actorId: target, clientId: target, mentor: false, lastMessageId: two.value.id }); await delivery.read({ actorId: target, clientId: target, mentor: false, lastMessageId: one.value.id });
  const read = await db.selectFrom("coaching_thread_reads").select("last_message_id").where("client_id", "=", target).where("reader_id", "=", target).executeTakeFirstOrThrow(); assert.equal(read.last_message_id, two.value.id);
});
test("Mentor reads the actual saved onboarding wrapper and all Start Point answers", async () => {
  const target = await account();
  const { createOnboarding } = await import("../src/features/onboarding/index.ts"), onboarding = createOnboarding({ db });
  const current = await onboarding.get({ accountId: target }); assert.ok(current.ok);
  const answers = { ...current.value.answers, questionnaire: { ...current.value.answers.questionnaire, transformation: "A stronger and more energetic next 180 days", now: "I want to show up well for my family", motivation: "Long-term capability" }, routine: { ...current.value.answers.routine, name: "Saved intake client", timezone: "Australia/Sydney", equipment: "Dumbbells and pull-up bar" } };
  assert.ok((await onboarding.save({ accountId: target, revision: current.value.revision, contentVersion: current.value.content.version, answers })).ok);
  const result = await delivery.client({ actorId: manager, clientId: target }); assert.ok(result.ok); assert.equal(result.value.goals, answers.questionnaire.transformation); assert.equal(result.value.equipment, answers.routine.equipment); assert.equal(result.value.timezone, "Australia/Sydney"); assert.ok(result.value.intake.some(i => i.value === answers.questionnaire.now)); assert.ok(result.value.intake.some(i => i.value === answers.questionnaire.motivation));
  assert.ok(!(await delivery.client({ actorId: mentor, clientId: target })).ok);
});
