import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
import type { OnboardingMarketingPermissionsId } from "../../platform/database/generated/public/OnboardingMarketingPermissions.ts";
import type { OnboardingSettingsKey } from "../../platform/database/generated/public/OnboardingSettings.ts";
import type { ClientResult } from "../../shared/client-result.ts";
import { err, ok } from "../../shared/result.ts";
import { isRevision } from "../../shared/validation.ts";
import { jsonData, lockAccount, readSnapshot } from "./persistence.ts";
import { readMarketingSnapshot, readMarketingRecords, readMarketingStory } from "./marketing-store.ts";
import { parseMarketingPermission, parseMarketingRelease, emptyMarketingPermission, hasMarketingChoices, marketingGrantProblem } from "./marketing-data.ts";
import type { MarketingRecord } from "./marketing-data.ts";
import type { OnboardingSnapshot } from "./data.ts";
import { parseStoryContent, storyMaterials } from "./story-data.ts";
import type { MarketingStory } from "./story-data.ts";
import type { MarketingStoriesId } from "../../platform/database/generated/public/MarketingStories.ts";
import type { AssessmentMediaId } from "../../platform/database/generated/public/AssessmentMedia.ts";
import { createProfiles, createPostgresProfileStore } from "../profile/index.ts";

const unavailable = () => err({ code: "unavailable", message: "Marketing choices could not be confirmed. Reload your saved choices before retrying." } as const);
export function createMarketingPermissions(config: Readonly<{ db: Kysely<Database> }>) {
  return {
    async save(input: Readonly<{ accountId: string; revision: unknown; permission: unknown }>): Promise<ClientResult<OnboardingSnapshot>> {
      const permission = parseMarketingPermission(input.permission);
      if (!isRevision(input.revision) || !permission) return err({ code: "invalid_input", message: "Check your marketing choices and field lengths." });
      const revision = input.revision;
      try {
        return await config.db.transaction().execute(async transaction => {
          await lockAccount(transaction, input.accountId);
          const current = await readMarketingSnapshot({ db: transaction, accountId: input.accountId });
          if (current.revision !== revision) return err({ code: "conflict", message: "Your marketing choices changed in another tab. Reload them before saving." });
          const granting = hasMarketingChoices(permission.choices);
          if (granting && (!current.release.approved || permission.version !== current.release.version)) return err({ code: "invalid_input", message: "Read the current approved marketing release before giving permission. You can always withdraw existing permission." });
          const story = granting && permission.storyId ? await readMarketingStory({ db: transaction, accountId: input.accountId, id: permission.storyId }) : null;
          if (granting && !story) return err({ code: "invalid_input", message: "Review a specific progress story before giving marketing permission." });
          if (story) {
            const profile = await createProfiles({ store: createPostgresProfileStore(transaction) }).get({ accountId: input.accountId });
            if (!profile.ok || !profile.value.profile.completed) return err({ code: "forbidden", message: "Story approval becomes available after your setup and a progress-story invitation." });
            if (Object.entries(storyMaterials({ story })).some(([key, value]) => permission.choices[key as keyof ReturnType<typeof storyMaterials>] !== value)) return err({ code: "invalid_input", message: "Approve only the exact material shown in the story." });
            if (story.mediaIds.length) {
              const files = await transaction.selectFrom("assessment_media").select("id").where("account_id", "=", input.accountId as AccountsId).where("status", "=", "ready").where("id", "in", story.mediaIds as AssessmentMediaId[]).execute();
              if (files.length !== story.mediaIds.length) return err({ code: "invalid_input", message: "The story's files changed or were removed. Ask Harry for an updated story." });
            }
          }
          const problem = marketingGrantProblem(permission);
          if (problem) return err({ code: "invalid_input", message: problem });
          const action = granting ? "granted" : current.record && current.record.action !== "declined" ? "withdrawn" : "declined";
          const saved = granting ? permission : emptyMarketingPermission(current.release.version);
          if (current.record?.action === action && JSON.stringify(current.record.permission) === JSON.stringify(saved) && JSON.stringify(current.record.release) === JSON.stringify(current.release)) return ok(await readSnapshot(transaction, input.accountId));
          await transaction.insertInto("onboarding_marketing_permissions").values({ id: randomUUID() as OnboardingMarketingPermissionsId, account_id: input.accountId as AccountsId, revision: revision + 1, data: jsonData({ action, permission: saved, release: current.release, ...(story ? { story } : {}) }) }).execute();
          return ok(await readSnapshot(transaction, input.accountId));
        });
      } catch { return unavailable(); }
    },
    async history(input: Readonly<{ accountId: string }>): Promise<ClientResult<readonly MarketingRecord[]>> {
      try { return ok(await readMarketingRecords({ db: config.db, accountId: input.accountId })); } catch { return unavailable(); }
    },
    async notice(input: Readonly<{ accountId: string }>): Promise<ClientResult<Readonly<{ pending: boolean }>>> {
      try { const [story, records] = await Promise.all([readMarketingStory({ db: config.db, accountId: input.accountId }), readMarketingRecords({ db: config.db, accountId: input.accountId })]); return ok({ pending: !!story && !records.some(record => record.story?.id === story.id) }); } catch { return unavailable(); }
    },
    async requestStory(input: Readonly<{ accountId: string; story: unknown }>): Promise<ClientResult<MarketingStory>> {
      const content = parseStoryContent(input.story);
      if (!content) return err({ code: "invalid_input", message: "Provide a milestone title and the exact results, testimonial or up to six owned files to review." });
      try {
        return await config.db.transaction().execute(async transaction => {
          await lockAccount(transaction, input.accountId);
          const profile = await createProfiles({ store: createPostgresProfileStore(transaction) }).get({ accountId: input.accountId });
          if (!profile.ok || !profile.value.profile.completed) return err({ code: "forbidden", message: "Request a story after the client has finished setup and made meaningful progress." });
          if (content.mediaIds.length) {
            const files = await transaction.selectFrom("assessment_media").select("id").where("account_id", "=", input.accountId as AccountsId).where("status", "=", "ready").where("id", "in", content.mediaIds as AssessmentMediaId[]).execute();
            if (files.length !== content.mediaIds.length) return err({ code: "invalid_input", message: "Every proposed file must be a ready assessment owned by this client." });
          }
          const id = randomUUID();
          const onboarding = await readSnapshot(transaction, input.accountId);
          await transaction.insertInto("marketing_stories").values({ id: id as MarketingStoriesId, account_id: input.accountId as AccountsId, data: jsonData({ ...content, clientName: onboarding.answers.consent.signedName || profile.value.profile.consent.signedName || profile.value.profile.name }) }).execute();
          const story = await readMarketingStory({ db: transaction, accountId: input.accountId, id });
          if (!story) throw new Error("Story not saved");
          return ok(story);
        });
      } catch { return unavailable(); }
    },
    async configure(input: Readonly<{ release: unknown }>): Promise<ClientResult<Readonly<{ configured: true }>>> {
      const release = parseMarketingRelease(input.release);
      if (!release) return err({ code: "invalid_input", message: "Supply a versioned marketing release and its approval status." });
      try {
        return await config.db.transaction().execute(async transaction => {
          await sql`select pg_advisory_xact_lock(721950107)`.execute(transaction);
          const key = `marketing-archive:${release.version}` as OnboardingSettingsKey;
          const prior = await transaction.selectFrom("onboarding_settings").select("data").where("key", "=", key).executeTakeFirst();
          if (prior && JSON.stringify(parseMarketingRelease(prior.data)) !== JSON.stringify(release)) return err({ code: "invalid_input", message: "Marketing document changes require a new version." });
          if (!prior) await transaction.insertInto("onboarding_settings").values({ key, data: jsonData(release) }).execute();
          await transaction.insertInto("onboarding_settings").values({ key: "marketing-release" as OnboardingSettingsKey, data: jsonData(release) }).onConflict(c => c.column("key").doUpdateSet({ data: jsonData(release), revision: sql`onboarding_settings.revision + 1` })).execute();
          return ok({ configured: true } as const);
        });
      } catch { return unavailable(); }
    },
  };
}
