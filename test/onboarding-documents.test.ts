import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/platform/database/connection.ts";
import type { AccountsId } from "../src/platform/database/generated/public/Accounts.ts";
import { createOnboarding, DOCUMENT_KINDS, DRAFT_DOCUMENTS, emptyContent } from "../src/features/onboarding/index.ts";
import { createProfiles, createPostgresProfileStore } from "../src/features/profile/index.ts";
import { startTestApp, testDatabaseUrl } from "./support/app.ts";
import { onboardingAnswers, onboardingContent } from "./support/onboarding.ts";
import { isRecord } from "../src/shared/validation.ts";

const db = createDatabase(testDatabaseUrl()), onboarding = createOnboarding({ db });
let app: Awaited<ReturnType<typeof startTestApp>>;
before(async () => { app = await startTestApp(); });
after(async () => { await app.close(); await db.destroy(); });
async function account() {
  const result = await app.auth.provisionAccount({ email: `documents-${randomUUID()}@example.test` });
  assert.ok(result.ok); return result.value.id;
}
async function configured() {
  const content = { ...onboardingContent(), version: `documents-${randomUUID()}` };
  assert.ok((await onboarding.configure({ content })).ok); return content;
}

test("account setup validates and atomically saves preferred name and time zone before welcome", async () => {
  const content = await configured(), id = await account();
  const bad = await onboarding.saveAccountSetup({ accountId: id, revision: 0, contentVersion: content.version, name: "Alex", timezone: "bad/zone" });
  assert.equal(bad.ok, false);
  const saved = await onboarding.saveAccountSetup({ accountId: id, revision: 0, contentVersion: content.version, name: " Alex ", timezone: "Europe/London" });
  assert.ok(saved.ok); assert.equal(saved.value.answers.routine.name, "Alex"); assert.equal(saved.value.answers.acknowledged.welcome, false);
  const profile = await createProfiles({ store: createPostgresProfileStore(db) }).get({ accountId: id }); assert.ok(profile.ok);
  assert.equal(profile.value.profile.name, "Alex"); assert.equal(profile.value.profile.timezone, "Europe/London"); assert.equal(profile.value.profile.completed, false);
  const stale = await onboarding.saveAccountSetup({ accountId: id, revision: 0, contentVersion: content.version, name: "Overwritten", timezone: "UTC" });
  assert.equal(stale.ok, false); if (!stale.ok) assert.equal(stale.error.code, "conflict");
});

test("the three participation forms sign independently and copies retain exact text and ownership", async () => {
  const content = await configured(), id = await account(), other = await account(), answers = onboardingAnswers();
  const parqOnly = { ...answers, consent: { ...answers.consent, accepted: false }, documents: { ...answers.documents!, informed: { ...answers.documents!.informed, accepted: false }, coaching: { ...answers.documents!.coaching, accepted: false } } };
  const first = await onboarding.save({ accountId: id, revision: 0, contentVersion: content.version, answers: parqOnly }); assert.ok(first.ok);
  assert.ok(first.value.documentSignedAt?.parq); assert.equal(first.value.documentSignedAt?.informed, null); assert.equal(first.value.documentSignedAt?.participation, null);
  const second = await onboarding.save({ accountId: id, revision: first.value.revision, contentVersion: content.version, answers }); assert.ok(second.ok);
  for (const kind of DOCUMENT_KINDS) assert.ok(second.value.documentSignedAt?.[kind]);
  assert.ok(second.value.consentSignedAt);
  const copy = await onboarding.documentCopy({ accountId: id, kind: "informed" }); assert.ok(copy.ok);
  assert.ok(copy.value.text.includes(content.documents!.informed.text)); assert.ok(copy.value.text.includes("Alex Example")); assert.ok(copy.value.text.includes("Sam"));
  assert.equal((await onboarding.documentCopy({ accountId: other, kind: "informed" })).ok, false);
  assert.equal((await onboarding.documentCopy({ accountId: id, kind: "unknown" })).ok, false);
});

test("changed emergency information requires fresh informed consent while preserving unrelated signatures and history", async () => {
  const content = await configured(), id = await account(), answers = onboardingAnswers();
  const first = await onboarding.save({ accountId: id, revision: 0, contentVersion: content.version, answers }); assert.ok(first.ok);
  const changed = { ...answers, routine: { ...answers.routine, emergencyName: "New contact" }, documents: { ...answers.documents!, informed: { ...answers.documents!.informed, accepted: false } } };
  const second = await onboarding.save({ accountId: id, revision: first.value.revision, contentVersion: content.version, answers: changed }); assert.ok(second.ok);
  assert.equal(second.value.documentSignedAt?.informed, null); assert.equal(second.value.documentSignedAt?.parq, first.value.documentSignedAt?.parq); assert.equal(second.value.documentSignedAt?.participation, first.value.documentSignedAt?.participation);
  const row = await db.selectFrom("onboarding_records").select("data").where("account_id", "=", id as AccountsId).executeTakeFirstOrThrow();
  assert.ok(isRecord(row.data)); assert.ok(Array.isArray(row.data.documentEvidence)); assert.equal(row.data.documentEvidence.length, 4);
  assert.equal((await onboarding.documentCopy({ accountId: id, kind: "informed" })).ok, false);
});

test("unapproved documents and the unresolved guarantee cannot acquire forged signature timestamps", async () => {
  const content = { ...onboardingContent(), version: `draft-documents-${randomUUID()}`, approved: false, documents: { ...onboardingContent().documents!, coaching: DRAFT_DOCUMENTS.coaching } };
  assert.ok((await onboarding.configure({ content })).ok);
  const id = await account(), answers = onboardingAnswers();
  const saved = await onboarding.save({ accountId: id, revision: 0, contentVersion: content.version, answers: { ...answers, documents: { ...answers.documents!, coaching: { version: DRAFT_DOCUMENTS.coaching.version, signedName: "Alex Example", accepted: true } }, documentSignedAt: { coaching: "2020-01-01" } } }); assert.ok(saved.ok);
  assert.equal(saved.value.documentSignedAt?.coaching, null); assert.equal((await onboarding.documentCopy({ accountId: id, kind: "coaching" })).ok, false);
  assert.equal((await onboarding.complete({ accountId: id, revision: saved.value.revision })).ok, false);
  assert.equal(emptyContent().documents?.informed.approved, false);
});
