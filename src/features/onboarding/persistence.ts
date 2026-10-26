import { sql } from "kysely";
import type { Kysely, Transaction } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
import type { OnboardingSettingsKey } from "../../platform/database/generated/public/OnboardingSettings.ts";
import { isRecord } from "../../shared/validation.ts";
import { emptyAnswers, emptyContent, parseAnswers, parseContent, missingRequirements } from "./data.ts";
import type { OnboardingSnapshot, OnboardingAnswers, OnboardingContent, Booking } from "./data.ts";
import { createProfiles, createPostgresProfileStore } from "../profile/index.ts";
import { readMarketingSnapshot } from "./marketing-store.ts";

export const jsonData = (value: unknown) => sql`cast(${JSON.stringify(value)} as jsonb)`;
export async function lockAccount(transaction: Transaction<Database>, accountId: string): Promise<void> {
  await transaction.selectFrom("accounts").select("id").where("id", "=", accountId as AccountsId).forUpdate().executeTakeFirstOrThrow();
}
export async function readContent(db: Kysely<Database>): Promise<OnboardingContent> {
  const row = await db.selectFrom("onboarding_settings").select("data").where("key", "=", "content" as OnboardingSettingsKey).forShare().executeTakeFirst();
  if (!row) return emptyContent();
  const content = parseContent(row.data);
  if (!content) throw new Error("Invalid onboarding content");
  return content;
}
export async function readSnapshot(db: Kysely<Database>, accountId: string): Promise<OnboardingSnapshot> {
  const owner = accountId as AccountsId;
  const [record, currentContent, media, bookingRow, resolutions, marketing] = await Promise.all([
    db.selectFrom("onboarding_records").selectAll().where("account_id", "=", owner).executeTakeFirst(),
    readContent(db),
    db.selectFrom("assessment_media").selectAll().where("account_id", "=", owner).where("status", "!=", "deleted").orderBy("created_at", "desc").execute(),
    db.selectFrom("onboarding_bookings").selectAll().where("account_id", "=", owner).executeTakeFirst(),
    db.selectFrom("onboarding_resolutions").selectAll().where("account_id", "=", owner).execute(),
    readMarketingSnapshot({ db, accountId }),
  ]);
  let content = currentContent;
  if (record?.completed_at && isRecord(record.data) && typeof record.data.contentVersion === "string" && record.data.contentVersion !== currentContent.version) {
    const archived = await db.selectFrom("onboarding_settings").select("data").where("key", "=", `archive:${record.data.contentVersion}` as OnboardingSettingsKey).executeTakeFirst();
    const parsed = archived ? parseContent(archived.data) : undefined;
    if (!parsed) throw new Error("Completed onboarding content unavailable");
    content = parsed;
  }
  let answers: OnboardingAnswers;
  if (record) {
    if (!isRecord(record.data)) throw new Error("Invalid onboarding record");
    const parsed = parseAnswers(record.data.answers);
    if (!parsed.ok) throw new Error("Invalid onboarding answers");
    answers = record.data.contentVersion === content.version ? parsed.value : { ...parsed.value, acknowledged: { welcome: false, communication: false, rhythm: false }, consent: { ...parsed.value.consent, accepted: false } };
    if (record.data.contentVersion !== content.version) {
      const archived = typeof record.data.contentVersion === "string" ? await db.selectFrom("onboarding_settings").select("data").where("key", "=", `archive:${record.data.contentVersion}` as OnboardingSettingsKey).executeTakeFirst() : undefined;
      const previous = archived ? parseContent(archived.data) : undefined;
      if (!previous || previous.parqVersion !== content.parqVersion || JSON.stringify(previous.healthQuestions) !== JSON.stringify(content.healthQuestions)) answers = { ...answers, health: Array.from({ length: 7 }, () => null) };
    }
  } else {
    const profile = await createProfiles({ store: createPostgresProfileStore(db) }).get({ accountId });
    if (!profile.ok) throw new Error("Profile unavailable");
    const p = profile.value.profile;
    answers = { ...emptyAnswers(), routine: { name: p.name, timezone: p.timezone, weight: String(p.startingWeight ?? ""), trainingDays: p.trainingDays, restDay: p.restDay, equipment: p.equipment, emergencyName: p.emergency.name, emergencyPhone: p.emergency.phone } };
  }
  const booking: Booking | null = bookingRow ? { providerId: bookingRow.provider_id, eventVersion: Number(bookingRow.event_version), status: bookingRow.status === "confirmed" ? "confirmed" : "cancelled", startsAt: bookingRow.starts_at.toISOString(), timezone: bookingRow.timezone, meetUrl: bookingRow.meet_url } : null;
  const evidence = { answers, content, media: media.filter(item => item.content_version === content.version).map(item => ({ id: item.id, slot: item.slot, mediaType: item.media_type, size: item.size, status: item.status === "ready" ? "ready" as const : "pending" as const })),
    booking, resolutions: resolutions.map(item => ({ requirement: item.requirement, reason: item.reason, resolvedBy: item.resolved_by, evidence: item.evidence })) };
  const acknowledgements: unknown[] = record && isRecord(record.data) && Array.isArray(record.data.evidence) ? record.data.evidence : [];
  const signature = JSON.stringify([content.version, answers.consent, answers.health, answers.healthDetails]);
  const acknowledgement = acknowledgements.find(item => isRecord(item) && item.signature === signature);
  const consentSignedAt = isRecord(acknowledgement) && typeof acknowledgement.signedAt === "string" && Number.isFinite(Date.parse(acknowledgement.signedAt)) ? acknowledgement.signedAt : null;
  const previousMedia = media.filter(item => item.content_version !== content.version).map(item => ({ id: item.id, slot: item.slot, mediaType: item.media_type, size: item.size, status: item.status === "ready" ? "ready" as const : "pending" as const }));
  return { version: "harry-v2", revision: record?.revision ?? 0, ...evidence, previousMedia, marketing, completedAt: record?.completed_at?.toISOString() ?? null, consentSignedAt, missing: missingRequirements(evidence) };
}
