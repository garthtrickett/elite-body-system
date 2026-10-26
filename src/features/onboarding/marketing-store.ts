import type { Kysely } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
import type { OnboardingSettingsKey } from "../../platform/database/generated/public/OnboardingSettings.ts";
import { DRAFT_MARKETING_RELEASE, parseMarketingRelease, parseMarketingRecord, activeMarketing } from "./marketing-data.ts";
import type { MarketingRelease, MarketingRecord, MarketingSnapshot } from "./marketing-data.ts";
import { parseMarketingStory } from "./story-data.ts";
import type { MarketingStoriesId } from "../../platform/database/generated/public/MarketingStories.ts";

export async function readMarketingRelease(db: Kysely<Database>): Promise<MarketingRelease> {
  const row = await db.selectFrom("onboarding_settings").select("data").where("key", "=", "marketing-release" as OnboardingSettingsKey).forShare().executeTakeFirst();
  const release = row ? parseMarketingRelease(row.data) : DRAFT_MARKETING_RELEASE;
  if (!release) throw new Error("Invalid marketing release");
  return release;
}
export async function readMarketingRecords(input: Readonly<{ db: Kysely<Database>; accountId: string; latestOnly?: boolean }>): Promise<readonly MarketingRecord[]> {
  const query = input.db.selectFrom("onboarding_marketing_permissions").selectAll().where("account_id", "=", input.accountId as AccountsId).orderBy("revision", "desc");
  const rows = await (input.latestOnly ? query.limit(1) : query).execute();
  return rows.map(row => {
    const data: unknown = row.data;
    const record = parseMarketingRecord(typeof data === "object" && data !== null ? { ...data, revision: row.revision, recordedAt: row.recorded_at.toISOString() } : null);
    if (!record) throw new Error("Invalid marketing permission record");
    return record;
  });
}
export async function readMarketingSnapshot(input: Readonly<{ db: Kysely<Database>; accountId: string }>): Promise<MarketingSnapshot> {
  const [release, records, story] = await Promise.all([readMarketingRelease(input.db), readMarketingRecords(input), readMarketingStory(input)]);
  const record = records[0] ?? null;
  return { release, revision: record?.revision ?? 0, record, story, active: activeMarketing(records) };
}
export async function readMarketingStory(input: Readonly<{ db: Kysely<Database>; accountId: string; id?: string }>) {
  let query = input.db.selectFrom("marketing_stories").selectAll().where("account_id", "=", input.accountId as AccountsId);
  if (input.id) query = query.where("id", "=", input.id as MarketingStoriesId);
  const row = await query.orderBy("created_at", "desc").orderBy("id", "desc").limit(1).executeTakeFirst();
  if (!row) return null;
  const story = parseMarketingStory(typeof row.data === "object" && row.data !== null ? { ...row.data, id: row.id, createdAt: row.created_at.toISOString() } : null);
  if (!story) throw new Error("Invalid story request");
  return story;
}
