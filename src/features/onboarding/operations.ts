import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import type { Kysely, Transaction } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
import type { OnboardingSettingsKey } from "../../platform/database/generated/public/OnboardingSettings.ts";
import type { OnboardingResolutionsId } from "../../platform/database/generated/public/OnboardingResolutions.ts";
import type { ClientResult } from "../../shared/client-result.ts";
import { err, ok } from "../../shared/result.ts";
import { isRecord, isRevision, isText } from "../../shared/validation.ts";
import { createProfiles, createPostgresProfileStore, clientDay } from "../profile/index.ts";
import { parseAnswers, parseContent, SECTIONS, mediaSlots, hasResolution, resolutionEvidence, isMeetUrl, consentSignature, accountSetupProblem } from "./data.ts";
import type { OnboardingSnapshot, Booking } from "./data.ts";
import { jsonData, lockAccount, readSnapshot } from "./persistence.ts";
import { DOCUMENT_KINDS, acknowledgement, documentFingerprint, documentProblem, legalDocument } from "./documents.ts";

const unavailable = () => err({ code: "unavailable", message: "Onboarding could not be updated. Your saved progress is safe; try again." } as const);
const conflict = () => err({ code: "conflict", message: "Your onboarding changed in another tab. Reload saved progress before continuing." } as const);

export function createOnboarding(config: Readonly<{ db: Kysely<Database>; now?: () => Date }>) {
  const now = config.now ?? (() => new Date());
  async function withAccount<T>(accountId: string, perform: (transaction: Transaction<Database>) => Promise<ClientResult<T>>): Promise<ClientResult<T>> {
    try { return await config.db.transaction().execute(async transaction => { await lockAccount(transaction, accountId); return perform(transaction); }); }
    catch { return unavailable(); }
  }
  return {
    get(input: Readonly<{ accountId: string }>): Promise<ClientResult<OnboardingSnapshot>> {
      return withAccount(input.accountId, async transaction => ok(await readSnapshot(transaction, input.accountId)));
    },
    async documentCopy(input: Readonly<{ accountId: string; kind: unknown }>): Promise<ClientResult<Readonly<{ fileName: string; text: string }>>> {
      const kind = DOCUMENT_KINDS.find(value => value === input.kind);
      if (!kind) return err({ code: "invalid_input", message: "Choose a valid document." });
      return withAccount(input.accountId, async transaction => {
        const current = await readSnapshot(transaction, input.accountId);
        const row = await transaction.selectFrom("onboarding_records").select("data").where("account_id", "=", input.accountId as AccountsId).executeTakeFirst();
        const records = row && isRecord(row.data) && Array.isArray(row.data.documentEvidence) ? row.data.documentEvidence : [];
        const fingerprint = documentFingerprint({ answers: current.answers, content: current.content, kind });
        const signed = records.find(item => isRecord(item) && item.kind === kind && item.fingerprint === fingerprint);
        if (!isRecord(signed) || !isRecord(signed.document) || typeof signed.document.text !== "string" || !isRecord(signed.acknowledgement)) return err({ code: "not_found", message: "A signed copy is not available for this document." });
        return ok({ fileName: `ebs-${kind}-signed.txt`, text: `${signed.document.text}\n\nDocument version: ${signed.document.version}\nElectronic signature: ${signed.acknowledgement.signedName}\nRecorded (UTC): ${signed.signedAt}\n\nSubmitted information\n${JSON.stringify(signed.details, null, 2)}\n` });
      });
    },
    async saveAccountSetup(input: Readonly<{ accountId: string; revision: unknown; contentVersion: unknown; name: unknown; timezone: unknown }>): Promise<ClientResult<OnboardingSnapshot>> {
      if (!isRevision(input.revision) || !isText(input.name, 100) || !isText(input.timezone, 100)) return err({ code: "invalid_input", message: "Enter your preferred name and time zone." });
      const name = input.name.trim(), timezone = input.timezone.trim();
      const problem = accountSetupProblem({ name, timezone });
      if (problem) return err({ code: "invalid_input", message: problem });
      return withAccount(input.accountId, async transaction => {
        const current = await readSnapshot(transaction, input.accountId);
        if (current.completedAt) return err({ code: "forbidden", message: "Manage your account details in Profile after onboarding." });
        if (current.revision !== input.revision || current.content.version !== input.contentVersion) return conflict();
        const store = createPostgresProfileStore(transaction);
        const profile = await createProfiles({ store }).get({ accountId: input.accountId });
        if (!profile.ok) return profile;
        if (profile.value.profile.name !== name || profile.value.profile.timezone !== timezone) {
          const saved = await store.write({ accountId: input.accountId, revision: profile.value.revision, profile: { ...profile.value.profile, name, timezone } });
          if (!saved) throw new Error("Concurrent account details edit");
        }
        const prior = await transaction.selectFrom("onboarding_records").select("data").where("account_id", "=", input.accountId as AccountsId).executeTakeFirst();
        const answers = { ...current.answers, routine: { ...current.answers.routine, name, timezone } };
        const data = jsonData({ ...(prior && isRecord(prior.data) ? prior.data : {}), answers, contentVersion: current.content.version });
        if (!prior) await transaction.insertInto("onboarding_records").values({ account_id: input.accountId as AccountsId, data, completed_at: null }).execute();
        else await transaction.updateTable("onboarding_records").set({ data, revision: current.revision + 1, updated_at: now() }).where("account_id", "=", input.accountId as AccountsId).execute();
        return ok(await readSnapshot(transaction, input.accountId));
      });
    },
    async eligible(input: Readonly<{ accountId: string }>): Promise<ClientResult<Readonly<{ eligible: boolean }>>> {
      try {
        const row = await config.db.selectFrom("onboarding_records").select(["completed_at", "flow_version"]).where("account_id", "=", input.accountId as AccountsId).executeTakeFirst();
        return ok({ eligible: row?.flow_version === "harry-v2" && !!row.completed_at });
      } catch { return unavailable(); }
    },
    async save(input: Readonly<{ accountId: string; revision: unknown; contentVersion: unknown; answers: unknown }>): Promise<ClientResult<OnboardingSnapshot>> {
      if (!isRevision(input.revision)) return err({ code: "invalid_input", message: "A saved-progress revision is required." });
      const parsed = parseAnswers(input.answers); if (!parsed.ok) return parsed;
      const revision = input.revision;
      return withAccount(input.accountId, async transaction => {
        const current = await readSnapshot(transaction, input.accountId);
        if (current.completedAt) return err({ code: "forbidden", message: "Onboarding is complete. Contact Harry to correct submitted assessment details." });
        if (current.revision !== revision || input.contentVersion !== current.content.version) return conflict();
        const prior = await transaction.selectFrom("onboarding_records").select("data").where("account_id", "=", input.accountId as AccountsId).executeTakeFirst();
        const previousEvidence = prior && isRecord(prior.data) && Array.isArray(prior.data.evidence) ? prior.data.evidence : [];
        const a = parsed.value;
        const consentReady = current.content.approved && ["parq", "informed", "participation"].every(kind => !documentProblem({ answers: a, content: current.content, kind: kind as "parq" | "informed" | "participation" }));
        const signature = consentSignature({ contentVersion: current.content.version, answers: a });
        const evidence = consentReady && !previousEvidence.some(item => isRecord(item) && item.signature === signature)
          ? [...previousEvidence, { signature, consentVersion: current.content.consentVersion, parqVersion: current.content.parqVersion, contentVersion: current.content.version, consent: a.consent, health: a.health, healthDetails: a.healthDetails, medicalClearance: a.medicalClearance, signedAt: now().toISOString() }] : previousEvidence;
        const documents: unknown[] = prior && isRecord(prior.data) && Array.isArray(prior.data.documentEvidence) ? [...prior.data.documentEvidence] : [];
        for (const kind of DOCUMENT_KINDS) {
          if (documentProblem({ answers: a, content: current.content, kind })) continue;
          const fingerprint = documentFingerprint({ answers: a, content: current.content, kind });
          if (documents.some(item => isRecord(item) && item.kind === kind && item.fingerprint === fingerprint)) continue;
          const details = kind === "parq" ? { questions: current.content.healthQuestions, answers: a.health, explanation: a.healthDetails, medicalClearance: a.medicalClearance }
            : kind === "informed" ? { emergencyContact: { name: a.routine.emergencyName, phone: a.routine.emergencyPhone }, healthData: a.consent.healthData }
            : kind === "participation" ? { adult: a.consent.adult } : { coachName: "Harry Baldwin" };
          documents.push({ kind, fingerprint, document: legalDocument(current.content, kind), acknowledgement: acknowledgement(a, kind), details, signedAt: now().toISOString() });
        }
        const data = jsonData({ ...(prior && isRecord(prior.data) ? prior.data : {}), answers: a, contentVersion: current.content.version, evidence, documentEvidence: documents });
        if (revision === 0) await transaction.insertInto("onboarding_records").values({ account_id: input.accountId as AccountsId, data, completed_at: null }).execute();
        else await transaction.updateTable("onboarding_records").set({ data, revision: revision + 1, updated_at: now() }).where("account_id", "=", input.accountId as AccountsId).execute();
        return ok(await readSnapshot(transaction, input.accountId));
      });
    },
    async complete(input: Readonly<{ accountId: string; revision: unknown }>): Promise<ClientResult<OnboardingSnapshot>> {
      if (!isRevision(input.revision)) return err({ code: "invalid_input", message: "A saved-progress revision is required." });
      return withAccount(input.accountId, async transaction => {
        const current = await readSnapshot(transaction, input.accountId);
        if (current.completedAt) return ok(current);
        if (current.revision !== input.revision) return conflict();
        const setupProblem = accountSetupProblem(current.answers.routine);
        if (setupProblem) return err({ code: "invalid_input", message: setupProblem });
        if (!current.consentSignedAt) return err({ code: "invalid_input", message: "Save your current signed consent and health screening before finishing onboarding." });
        if (DOCUMENT_KINDS.some(kind => !current.documentSignedAt?.[kind])) return err({ code: "invalid_input", message: "Sign and save each required form before finishing onboarding." });
        if (SECTIONS.some(section => current.missing[section].length)) return err({ code: "invalid_input", message: "Complete every onboarding section before opening your dashboard." });
        const store = createPostgresProfileStore(transaction);
        const existing = await createProfiles({ store }).get({ accountId: input.accountId }); if (!existing.ok) return existing;
        const p = existing.value.profile, a = current.answers;
        const profile = { ...p, onboardingVersion: "harry-v2" as const, name: a.routine.name, timezone: a.routine.timezone,
          startDate: p.completed ? p.startDate : clientDay({ timezone: a.routine.timezone, now: now() }), startingWeight: p.completed ? p.startingWeight : Number(a.routine.weight),
          trainingDays: a.routine.trainingDays, restDay: a.routine.restDay, equipment: a.routine.equipment,
          emergency: { name: a.routine.emergencyName, phone: a.routine.emergencyPhone },
          health: { answers: a.health, details: a.healthDetails, clearance: !a.health.some(Boolean) || hasResolution({ ...current, requirement: "health-clearance" }) }, completed: true, setupStep: 33 };
        const saved = await store.write({ accountId: input.accountId, revision: existing.value.revision, profile });
        if (!saved) throw new Error("Concurrent profile edit");
        const prior = await transaction.selectFrom("onboarding_records").select("data").where("account_id", "=", input.accountId as AccountsId).executeTakeFirstOrThrow();
        if (!isRecord(prior.data)) throw new Error("Invalid stored onboarding");
        const completionTime = now();
        const data = jsonData({ ...prior.data, completionEvidence: { completedAt: completionTime.toISOString(), contentVersion: current.content.version, media: current.media.filter(item => item.status === "ready"), booking: current.booking, resolutions: current.resolutions } });
        await transaction.updateTable("onboarding_records").set({ data, completed_at: completionTime, revision: current.revision + 1, updated_at: completionTime }).where("account_id", "=", input.accountId as AccountsId).execute();
        return ok(await readSnapshot(transaction, input.accountId));
      });
    },
    async configure(input: Readonly<{ content: unknown }>): Promise<ClientResult<Readonly<{ configured: true }>>> {
      const content = parseContent(input.content);
      if (!content || !content.version.trim() || content.version === "unconfigured") return err({ code: "invalid_input", message: "Supply versioned onboarding content with seven approved screening questions." });
      try {
        return await config.db.transaction().execute(async transaction => {
          await sql`select pg_advisory_xact_lock(721950106)`.execute(transaction);
          const archiveKey = `archive:${content.version}` as OnboardingSettingsKey;
          const prior = await transaction.selectFrom("onboarding_settings").select("data").where("key", "=", archiveKey).executeTakeFirst();
          if (prior && JSON.stringify(parseContent(prior.data)) !== JSON.stringify(content)) return err({ code: "invalid_input", message: "Content changes require a new version so acknowledgements stay accurate." });
          if (!prior) await transaction.insertInto("onboarding_settings").values({ key: archiveKey, data: jsonData(content) }).execute();
          await transaction.insertInto("onboarding_settings").values({ key: "content" as OnboardingSettingsKey, data: jsonData(content) }).onConflict(c => c.column("key").doUpdateSet({ data: jsonData(content), revision: sql`onboarding_settings.revision + 1` })).execute();
          return ok({ configured: true } as const);
        });
      } catch { return unavailable(); }
    },
    async resolveRequirement(input: Readonly<{ accountId: string; requirement: unknown; reason: unknown; resolvedBy: unknown }>): Promise<ClientResult<OnboardingSnapshot>> {
      if (!isText(input.requirement, 100) || !isText(input.reason, 2000) || !input.reason.trim() || !isText(input.resolvedBy, 200) || !input.resolvedBy.trim()) return err({ code: "invalid_input", message: "An assessment requirement, reason and authorized reviewer are required." });
      const requirement = input.requirement, reason = input.reason.trim(), resolvedBy = input.resolvedBy.trim();
      return withAccount(input.accountId, async transaction => {
        const current = await readSnapshot(transaction, input.accountId);
        if (current.completedAt && requirement !== "health-clearance") return err({ code: "forbidden", message: "Only an authorized health-clearance update can be added after onboarding is complete." });
        if (!["health-clearance", "health-audit-alternative"].includes(requirement) && !mediaSlots(current.content).some(item => item.id === requirement && !item.id.startsWith("photo:"))) return err({ code: "invalid_input", message: "Only physical-audit requirements may have an approved alternative." });
        await transaction.insertInto("onboarding_resolutions").values({ id: randomUUID() as OnboardingResolutionsId, account_id: input.accountId as AccountsId, requirement, reason, resolved_by: resolvedBy, evidence: resolutionEvidence({ ...current, requirement }) }).execute();
        if (current.completedAt && requirement === "health-clearance") {
          const store = createPostgresProfileStore(transaction), prior = await store.read({ accountId: input.accountId });
          if (!prior) throw new Error("Missing completed profile");
          if (!await store.write({ accountId: input.accountId, revision: prior.revision, profile: { ...prior.profile, health: { ...prior.profile.health, clearance: true } } })) throw new Error("Concurrent profile change");
        }
        if (current.revision) await transaction.updateTable("onboarding_records").set({ revision: current.revision + 1, updated_at: now() }).where("account_id", "=", input.accountId as AccountsId).execute();
        return ok(await readSnapshot(transaction, input.accountId));
      });
    },
    async recordBooking(input: Readonly<{ accountId: string; booking: unknown }>): Promise<ClientResult<OnboardingSnapshot>> {
      const b = input.booking;
      if (!isRecord(b) || !isText(b.providerId, 500) || !b.providerId.trim() || !isRevision(b.eventVersion) || !["confirmed", "cancelled"].includes(String(b.status)) || !isText(b.startsAt, 100) || !Number.isFinite(Date.parse(b.startsAt)) || !isText(b.timezone, 100) || !isMeetUrl(b.meetUrl)) return err({ code: "invalid_input", message: "A verified provider event with a Google Meet link is required." });
      try { new Intl.DateTimeFormat("en", { timeZone: b.timezone }); } catch { return err({ code: "invalid_input", message: "Invalid appointment timezone." }); }
      const booking = b as Booking;
      return withAccount(input.accountId, async transaction => {
        const current = await readSnapshot(transaction, input.accountId);
        if (current.booking && current.booking.providerId === booking.providerId && current.booking.eventVersion >= booking.eventVersion) return ok(current);
        if (current.booking && current.booking.providerId !== booking.providerId && b.replacesProviderId !== current.booking.providerId) return err({ code: "conflict", message: "Your booking changed while it was being confirmed. Refresh confirmation again." });
        await transaction.insertInto("onboarding_bookings").values({ account_id: input.accountId as AccountsId, provider_id: booking.providerId, event_version: String(booking.eventVersion), status: booking.status, starts_at: booking.startsAt, timezone: booking.timezone, meet_url: booking.meetUrl })
          .onConflict(c => c.column("account_id").doUpdateSet({ provider_id: booking.providerId, event_version: String(booking.eventVersion), status: booking.status, starts_at: booking.startsAt, timezone: booking.timezone, meet_url: booking.meetUrl, verified_at: now() })).execute();
        if (current.revision && !current.completedAt) await transaction.updateTable("onboarding_records").set({ revision: current.revision + 1, updated_at: now() }).where("account_id", "=", input.accountId as AccountsId).execute();
        return ok(await readSnapshot(transaction, input.accountId));
      });
    },
  } as const;
}
