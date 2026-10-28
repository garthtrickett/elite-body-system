import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "kysely";
import { createDatabase } from "../src/platform/database/connection.ts";
import type { AccountsId } from "../src/platform/database/generated/public/Accounts.ts";
import type { SalesVisitorsId } from "../src/platform/database/generated/public/SalesVisitors.ts";
import type { SalesLeadsId } from "../src/platform/database/generated/public/SalesLeads.ts";
import { createPublicSales, createSalesManagement } from "../src/features/sales/index.ts";
import { DEFAULT_SETTINGS, parsePublic, parseManagement, parseSettings, mediaSource } from "../src/features/sales/contracts.ts";
import { startTestApp, testDatabaseUrl } from "./support/app.ts";
const db = createDatabase(testDatabaseUrl()), accounts: AccountsId[] = [], visitors: SalesVisitorsId[] = [];
const publicSales = createPublicSales({ db }), management = createSalesManagement({ db });
let app: Awaited<ReturnType<typeof startTestApp>>, manager: AccountsId, outsider: AccountsId;
before(async () => {
  app = await startTestApp();
  for (const name of ["manager", "outsider"]) { const a = await app.auth.provisionAccount({ email: `sales-${name}-${randomUUID()}@example.test` }); assert.ok(a.ok); accounts.push(a.value.id as AccountsId); }
  manager = accounts[0]!; outsider = accounts[1]!;
  await db.insertInto("business_managers").values({ account_id: manager }).execute();
});
after(async () => { await db.deleteFrom("sales_visitors").where("id", "in", visitors).execute(); await db.deleteFrom("accounts").where("id", "in", accounts).execute(); await app.close(); await db.destroy(); });
async function visitor() {
  const token = randomBytes(32).toString("base64url"), v = await publicSales.visitor({ token, source: "Portal regression" }); assert.ok(v.ok); visitors.push(v.value.id as SalesVisitorsId); return token;
}
const application = (email: string) => ({ name: "Portal applicant", email, phone: "", age: "40–49", role: "Founder", goal: "Strength and energy", training: "Three days", obstacle: "Travel and routine", invest: "Ready to invest" });
async function apply() { const token = await visitor(), result = await publicSales.apply({ token, application: application(`applicant-${randomUUID()}@example.test`) }); assert.ok(result.ok); return token; }

test("manager access protects settings, journeys, private scripts and lead writes", async () => {
  const access = await management.access({ actorId: outsider }); assert.deepEqual(access, { ok: true, value: { allowed: false } });
  const denied = await management.snapshot({ actorId: outsider }); assert.ok(!denied.ok && denied.error.code === "forbidden");
  const write = await management.settings({ actorId: outsider, revision: 1, settings: DEFAULT_SETTINGS }); assert.ok(!write.ok && write.error.code === "forbidden");
  const snapshot = await management.snapshot({ actorId: manager }); assert.ok(snapshot.ok); assert.ok(parseManagement(snapshot.value));
  assert.deepEqual(snapshot.value.callScript.map(p => p.step), ["C", "L", "O", "S", "E", "R"]);
  assert.match(snapshot.value.callScript[4]!.prompt, /£2,400.*£5,000/);
});

test("visitor consent, withdrawal, application retries and journey visits persist separately", async () => {
  const token = await visitor();
  assert.ok(!(await publicSales.identify({ token, name: "Applicant", email: "a@example.test", subscribe: false })).ok);
  const joined = await publicSales.identify({ token, name: "Applicant", email: "a@example.test", subscribe: true }); assert.ok(joined.ok && joined.value.subscribed);
  const appData = application("a@example.test");
  const replies = await Promise.all([publicSales.apply({ token, application: appData }), publicSales.apply({ token, application: appData })]); assert.ok(replies.every(r => r.ok));
  const current = await publicSales.get({ token, page: "apply" }); assert.ok(current.ok && current.value.applied && current.value.subscribed); assert.ok(parsePublic(current.value));
  assert.doesNotMatch(JSON.stringify(current.value), /callScript|mentorIntroScript|notes|token_hash/);
  await publicSales.get({ token, page: "apply" });
  const lead = await db.selectFrom("sales_leads").selectAll().where("email", "=", "a@example.test").where("visitor_id", "in", visitors).executeTakeFirstOrThrow();
  assert.equal(lead.stage, "applied"); assert.ok(lead.insights_subscribed_at); assert.match(lead.insights_consent ?? "", /30 Days/);
  const journey = await management.journey({ actorId: manager, leadId: lead.id }); assert.ok(journey.ok); assert.equal(journey.value.filter(e => e.kind === "applied").length, 1); assert.equal(journey.value.filter(e => e.kind === "view:apply").length, 1);
  const withdrawn = await publicSales.unsubscribe({ token }); assert.ok(withdrawn.ok && !withdrawn.value.subscribed && withdrawn.value.applied);
  assert.ok(!(await publicSales.get({ token: "x".repeat(43), page: "apply" })).ok);
});

test("only approved published stories are public and concurrent page edits use revisions", async () => {
  const initial = await management.snapshot({ actorId: manager }); assert.ok(initial.ok);
  const stories = [{ id: "portal-draft", name: "Private", title: "Private draft", body: "Not published", imageUrl: "", videoUrl: "", published: false, consentConfirmed: false }, { id: "portal-public", name: "Approved client", title: "Approved story", body: "Owner approved content", imageUrl: "", videoUrl: "", published: true, consentConfirmed: true }];
  const settings = { ...initial.value.settings, stories };
  try {
    const writes = await Promise.all([management.settings({ actorId: manager, revision: initial.value.revision, settings }), management.settings({ actorId: manager, revision: initial.value.revision, settings: { ...settings, caseTitle: "Other tab" } })]);
    assert.equal(writes.filter(r => r.ok).length, 1); assert.ok(writes.some(r => !r.ok && r.error.code === "conflict"));
    const publicView = await publicSales.get({ token: await visitor(), page: "client-stories" }); assert.ok(publicView.ok); assert.deepEqual(publicView.value.settings.stories.map(s => s.id), ["portal-public"]);
    assert.doesNotMatch(JSON.stringify(publicView.value), /Private draft|Not published/);
    assert.equal(parseSettings({ ...settings, stories: [{ ...stories[1], consentConfirmed: false }] }), undefined);
    assert.equal(parseSettings({ ...settings, mentorVideo: "javascript:alert(1)" }), undefined);
    assert.equal(mediaSource("https://www.youtube.com/watch?v=abcdefghijk")?.url, "https://www.youtube-nocookie.com/embed/abcdefghijk");
  } finally { const current = await management.snapshot({ actorId: manager }); assert.ok(current.ok); assert.ok((await management.settings({ actorId: manager, revision: current.value.revision, settings: initial.value.settings })).ok); }
});

test("booking races reserve one call, prevent overlaps and cancel without deleting the journey", async () => {
  const one = await apply(), two = await apply(), start = Date.now() + 30 * 86400000;
  const slot = await management.slot({ actorId: manager, startsAt: new Date(start).toISOString(), endsAt: new Date(start + 1800000).toISOString(), meetingUrl: "https://meet.example.test/portal" }); assert.ok(slot.ok);
  try {
    const overlap = await management.slot({ actorId: manager, startsAt: new Date(start + 60000).toISOString(), endsAt: new Date(start + 120000).toISOString(), meetingUrl: "" }); assert.ok(!overlap.ok && overlap.error.code === "conflict");
    assert.ok(!(await publicSales.book({ token: await visitor(), slotId: slot.value.id })).ok);
    const bookings = await Promise.all([publicSales.book({ token: one, slotId: slot.value.id }), publicSales.book({ token: two, slotId: slot.value.id })]);
    assert.equal(bookings.filter(r => r.ok).length, 1); assert.ok(bookings.some(r => !r.ok && r.error.code === "conflict"));
    const token = bookings[0]!.ok ? one : two;
    const repeat = await publicSales.book({ token, slotId: slot.value.id }); assert.ok(repeat.ok && repeat.value.booking?.id === slot.value.id);
    assert.ok(!(await management.removeSlot({ actorId: manager, slotId: slot.value.id })).ok);
    const row = await db.selectFrom("sales_call_slots").select("booked_lead_id").where("id", "=", slot.value.id as import("../src/platform/database/generated/public/SalesCallSlots.ts").SalesCallSlotsId).executeTakeFirstOrThrow(); assert.ok(row.booked_lead_id);
    const lead = await db.selectFrom("sales_leads").selectAll().where("id", "=", row.booked_lead_id).executeTakeFirstOrThrow();
    assert.ok((await management.cancelBooking({ actorId: manager, leadId: lead.id, revision: lead.revision })).ok);
    const after = await publicSales.get({ token, page: "book-call" }); assert.ok(after.ok && after.value.booking === null && after.value.applied);
    const journey = await management.journey({ actorId: manager, leadId: lead.id }); assert.ok(journey.ok && journey.value.some(e => e.kind === "call_cancelled"));
  } finally { await management.removeSlot({ actorId: manager, slotId: slot.value.id }); }
});

test("lead pagination uses exact PostgreSQL microseconds without losing a record", async () => {
  const token = await apply();
  const latest = await db.selectFrom("sales_leads").select("id").where("visitor_id", "=", visitors.at(-1)!).executeTakeFirstOrThrow();
  const another = await apply(); void token; void another;
  const older = await db.selectFrom("sales_leads").select("id").where("visitor_id", "=", visitors.at(-1)!).executeTakeFirstOrThrow();
  await sql`update sales_leads set created_at='2020-01-01T00:00:00.123456Z'::timestamptz where id=${latest.id}::uuid`.execute(db);
  await sql`update sales_leads set created_at='2020-01-01T00:00:00.123455Z'::timestamptz where id=${older.id}::uuid`.execute(db);
  const page = await management.snapshot({ actorId: manager, before: latest.id }); assert.ok(page.ok); assert.ok(page.value.leads.some(l => l.id === older.id)); assert.ok(!page.value.leads.some(l => l.id === latest.id));
  const stage = await management.lead({ actorId: manager, leadId: older.id, stage: "call_booked", notes: "", revision: 1 }); assert.ok(!stage.ok && stage.error.code === "invalid_input");
  const write = await management.lead({ actorId: manager, leadId: older.id as SalesLeadsId, stage: "follow_up", notes: "Agreed next step", revision: 1 }); assert.ok(write.ok);
  const stale = await management.lead({ actorId: manager, leadId: older.id, stage: "lost", notes: "", revision: 1 }); assert.ok(!stale.ok && stale.error.code === "conflict");
});
