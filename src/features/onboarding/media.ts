import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
import type { AssessmentMediaId } from "../../platform/database/generated/public/AssessmentMedia.ts";
import { err, ok } from "../../shared/result.ts";
import type { ClientResult } from "../../shared/client-result.ts";
import { mediaSlots, assessmentSubmissionProblem } from "./data.ts";
import type { OnboardingSnapshot } from "./data.ts";
import { lockAccount, readSnapshot } from "./persistence.ts";
import type { AssessmentStorage } from "./storage.ts";

const unavailable = () => err({ code: "unavailable", message: "The assessment file could not be updated. Try again." } as const);
const notConfigured = () => err({ code: "not_configured", message: "Private assessment storage is not configured yet. Your answers can still be saved." } as const);
export function createAssessmentMedia(config: Readonly<{ db: Kysely<Database>; storage?: AssessmentStorage; now?: () => Date }>) {
  const now = config.now ?? (() => new Date());
  return {
    async request(input: Readonly<{ accountId: string; slot: unknown; mediaType: unknown; size: unknown }>): Promise<ClientResult<Readonly<{ id: string; url: string; headers: Readonly<Record<string, string>> }>>> {
      if (!config.storage) return notConfigured();
      const storage = config.storage;
      try {
        return await config.db.transaction().execute(async transaction => {
          await lockAccount(transaction, input.accountId);
          const account = await transaction.selectFrom("accounts").select("email").where("id", "=", input.accountId as AccountsId).executeTakeFirstOrThrow();
          if (account.email === "harrybaldwin@preview.invalid") return err({ code: "forbidden", message: "Use your personal client account for private assessment uploads." });
          const snapshot = await readSnapshot(transaction, input.accountId);
          if (snapshot.completedAt) return err({ code: "forbidden", message: "Contact Harry to change completed onboarding submissions." });
          const slot = mediaSlots(snapshot.content).find(item => item.id === input.slot);
          const types = slot?.kind === "video" ? ["video/mp4", "video/quicktime", "video/webm"] : ["image/jpeg", "image/png", "image/webp"];
          if (!slot || typeof input.mediaType !== "string" || !types.includes(input.mediaType) || typeof input.size !== "number" || !Number.isSafeInteger(input.size) || input.size < 12 || input.size > (slot.kind === "video" ? 250 : 12) * 1024 * 1024) return err({ code: "invalid_input", message: "Choose a supported image up to 12 MiB or video up to 250 MiB." });
          const problem = assessmentSubmissionProblem({ ...snapshot, slot: slot.id });
          if (problem) return err({ code: "forbidden", message: problem });
          const pending = await transaction.selectFrom("assessment_media").select("id").where("account_id", "=", input.accountId as AccountsId).where("status", "=", "pending").execute();
          if (pending.length >= 24) return err({ code: "rate_limited", message: "Remove an unfinished upload before adding another." });
          const id = randomUUID() as AssessmentMediaId, key = `onboarding/pending/${input.accountId}/${id}`;
          const authorization = await storage.authorizeUpload({ key, mediaType: input.mediaType, size: input.size });
          await transaction.insertInto("assessment_media").values({ id, account_id: input.accountId as AccountsId, slot: slot.id, content_version: snapshot.content.version, object_key: key, media_type: input.mediaType, size: input.size }).execute();
          return ok({ id, ...authorization });
        });
      } catch { return unavailable(); }
    },
    async finalize(input: Readonly<{ accountId: string; id: unknown }>): Promise<ClientResult<OnboardingSnapshot>> {
      if (!config.storage) return notConfigured();
      if (typeof input.id !== "string" || !/^[a-f0-9-]{36}$/.test(input.id)) return err({ code: "invalid_input", message: "Choose an assessment file." });
      const id = input.id as AssessmentMediaId, storage = config.storage;
      try {
        return await config.db.transaction().execute(async transaction => {
          await lockAccount(transaction, input.accountId);
          const current = await readSnapshot(transaction, input.accountId);
          if (current.completedAt) return err({ code: "forbidden", message: "This onboarding is already complete." });
          const row = await transaction.selectFrom("assessment_media").selectAll().where("account_id", "=", input.accountId as AccountsId).where("id", "=", id).executeTakeFirst();
          if (!row || row.status === "deleted") return err({ code: "not_found", message: "Assessment file not found." });
          if (row.status === "ready") return ok(current);
          const problem = assessmentSubmissionProblem({ ...current, slot: row.slot });
          if (problem) return err({ code: "forbidden", message: problem });
          if (row.content_version !== current.content.version || !mediaSlots(current.content).some(slot => slot.id === row.slot)) return err({ code: "conflict", message: "The assessment protocol changed. Reload before uploading." });
          if (now().getTime() - row.created_at.getTime() > 24 * 60 * 60 * 1000) return err({ code: "invalid_input", message: "This unfinished upload expired. Remove it and choose the file again." });
          const readyKey = `onboarding/ready/${input.accountId}/${id}`;
          if (!await storage.finalize({ pendingKey: row.object_key, readyKey, mediaType: row.media_type, size: row.size })) return err({ code: "invalid_input", message: "The uploaded file does not match its declared type or size. Choose a valid file." });
          await transaction.updateTable("assessment_media").set({ object_key: readyKey, status: "ready", finalized_at: now() }).where("id", "=", id).execute();
          const replaced = await transaction.selectFrom("assessment_media").select(["id", "object_key"]).where("account_id", "=", input.accountId as AccountsId).where("slot", "=", row.slot).where("status", "=", "ready").where("id", "!=", id).execute();
          for (const prior of replaced) {
            await transaction.updateTable("assessment_media").set({ status: "deleted" }).where("id", "=", prior.id).execute();
          }
          await transaction.updateTable("onboarding_records").set({ revision: current.revision + 1, updated_at: now() }).where("account_id", "=", input.accountId as AccountsId).execute();
          return ok(await readSnapshot(transaction, input.accountId));
        });
      } catch { return unavailable(); }
    },
    async read(input: Readonly<{ accountId: string; id: unknown }>): Promise<ClientResult<Readonly<{ url: string }>>> {
      if (!config.storage) return notConfigured();
      if (typeof input.id !== "string" || !/^[a-f0-9-]{36}$/.test(input.id)) return err({ code: "invalid_input", message: "Choose an assessment file." });
      try {
        const row = await config.db.selectFrom("assessment_media").select("object_key").where("account_id", "=", input.accountId as AccountsId).where("id", "=", input.id as AssessmentMediaId).where("status", "=", "ready").executeTakeFirst();
        return row ? ok({ url: await config.storage.authorizeRead({ key: row.object_key }) }) : err({ code: "not_found", message: "Assessment file not found." });
      } catch { return unavailable(); }
    },
    async remove(input: Readonly<{ accountId: string; id: unknown }>): Promise<ClientResult<OnboardingSnapshot>> {
      if (!config.storage) return notConfigured();
      if (typeof input.id !== "string" || !/^[a-f0-9-]{36}$/.test(input.id)) return err({ code: "invalid_input", message: "Choose an assessment file." });
      const storage = config.storage;
      let removedKey: string | undefined;
      try {
        const result = await config.db.transaction().execute(async (transaction): Promise<ClientResult<OnboardingSnapshot>> => {
          await lockAccount(transaction, input.accountId);
          const current = await readSnapshot(transaction, input.accountId);
          const row = await transaction.selectFrom("assessment_media").selectAll().where("account_id", "=", input.accountId as AccountsId).where("id", "=", input.id as AssessmentMediaId).executeTakeFirst();
          if (!row) return err({ code: "not_found", message: "Assessment file not found." });
          removedKey = row.object_key;
          if (row.status !== "deleted") {
            await transaction.updateTable("assessment_media").set({ status: "deleted" }).where("id", "=", row.id).execute();
            if (!current.completedAt && current.revision) await transaction.updateTable("onboarding_records").set({ revision: current.revision + 1, updated_at: now() }).where("account_id", "=", input.accountId as AccountsId).execute();
          }
          return ok(await readSnapshot(transaction, input.accountId));
        });
        if (removedKey) await storage.remove({ key: removedKey });
        return result;
      } catch { return unavailable(); }
    },
    async cleanup(): Promise<ClientResult<Readonly<{ removed: number }>>> {
      if (!config.storage) return notConfigured();
      try {
        const keys = await config.storage.listExpired({ before: new Date(now().getTime() - 24 * 60 * 60 * 1000) });
        let removed = 0;
        for (const key of keys) {
          const row = await config.db.selectFrom("assessment_media").select(["account_id", "status"]).where("object_key", "=", key).executeTakeFirst();
          if (row?.status === "ready") continue;
          if (row) await config.db.transaction().execute(async transaction => {
            await lockAccount(transaction, row.account_id);
            const current = await transaction.selectFrom("assessment_media").select("status").where("object_key", "=", key).executeTakeFirst();
            if (current?.status === "ready") return;
            await config.storage!.remove({ key });
            await transaction.updateTable("assessment_media").set({ status: "deleted" }).where("object_key", "=", key).execute(); removed++;
          });
          else { await config.storage.remove({ key }); removed++; }
        }
        const deleted = await config.db.selectFrom("assessment_media").select("object_key").where("status", "=", "deleted").execute();
        for (const row of deleted) await config.storage.remove({ key: row.object_key });
        return ok({ removed: removed + deleted.length });
      } catch { return unavailable(); }
    },
  } as const;
}
