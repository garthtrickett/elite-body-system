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
import { readMarketingSnapshot, readMarketingRecords } from "./marketing-store.ts";
import { parseMarketingPermission, parseMarketingRelease, emptyMarketingPermission, hasMarketingChoices, marketingGrantProblem } from "./marketing-data.ts";
import type { MarketingRecord } from "./marketing-data.ts";
import type { OnboardingSnapshot } from "./data.ts";

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
          const problem = marketingGrantProblem(permission);
          if (problem) return err({ code: "invalid_input", message: problem });
          const action = granting ? "granted" : current.record && current.record.action !== "declined" ? "withdrawn" : "declined";
          const saved = granting ? permission : emptyMarketingPermission(current.release.version);
          if (current.record?.action === action && JSON.stringify(current.record.permission) === JSON.stringify(saved) && JSON.stringify(current.record.release) === JSON.stringify(current.release)) return ok(await readSnapshot(transaction, input.accountId));
          await transaction.insertInto("onboarding_marketing_permissions").values({ id: randomUUID() as OnboardingMarketingPermissionsId, account_id: input.accountId as AccountsId, revision: revision + 1, data: jsonData({ action, permission: saved, release: current.release }) }).execute();
          return ok(await readSnapshot(transaction, input.accountId));
        });
      } catch { return unavailable(); }
    },
    async history(input: Readonly<{ accountId: string }>): Promise<ClientResult<readonly MarketingRecord[]>> {
      try { return ok(await readMarketingRecords({ db: config.db, accountId: input.accountId })); } catch { return unavailable(); }
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
