import { err, ok } from "../../shared/result.ts";
import { isRevision } from "../../shared/validation.ts";
import { emptyProfile, parseProfile, clientDay } from "./data.ts";
import type { ClientProfile, ClientResult, ProfileSnapshot } from "./data.ts";

export type ProfileStore = Readonly<{
  read: (input: Readonly<{ accountId: string }>) => Promise<ProfileSnapshot | undefined>;
  write: (input: Readonly<{ accountId: string; revision: number; profile: ClientProfile }>) => Promise<ProfileSnapshot | undefined>;
}>;

export function createProfiles(config: Readonly<{ store: ProfileStore; now?: () => Date }>) {
  const now = config.now ?? (() => new Date());
  return {
    async get(input: Readonly<{ accountId: string }>): Promise<ClientResult<ProfileSnapshot>> {
      try { return ok(await config.store.read(input) ?? { profile: emptyProfile(), revision: 0 }); }
      catch { return err({ code: "unavailable", message: "Your profile could not be loaded. Try again." }); }
    },
    async save(input: Readonly<{ accountId: string; revision: unknown; profile: unknown }>): Promise<ClientResult<ProfileSnapshot>> {
      if (!isRevision(input.revision)) return err({ code: "invalid_input", message: "A profile revision is required." });
      const parsed = parseProfile(input.profile);
      if (!parsed.ok) return parsed;
      try {
        const prior = await config.store.read({ accountId: input.accountId });
        // The first completion date and signed-at timestamp cannot be forged by browser input.
        const profile = { ...parsed.value, startDate: prior?.profile.completed ? prior.profile.startDate : parsed.value.completed ? clientDay({ timezone: parsed.value.timezone, now: now() }) : parsed.value.startDate,
          consent: { ...parsed.value.consent, signedAt: parsed.value.completed ? prior?.profile.consent.signedAt ?? now().toISOString() : undefined } };
        const saved = await config.store.write({ accountId: input.accountId, revision: input.revision, profile });
        return saved ? ok(saved) : err({ code: "conflict", message: "Your profile changed in another tab. Reload before saving." });
      } catch { return err({ code: "unavailable", message: "Your profile was not saved. Try again." }); }
    },
  } as const;
}
