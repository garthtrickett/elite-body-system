import { emptyProfile } from "../../src/features/profile/index.ts";
import type { ClientProfile } from "../../src/features/profile/index.ts";

export function completedProfile(overrides: Partial<ClientProfile> = {}): ClientProfile {
  const date = new Date(); date.setUTCDate(date.getUTCDate() - 11);
  return { ...emptyProfile(), name: "Test client", startDate: date.toISOString().slice(0, 10), startingWeight: 79.6,
    anchor: "breakfast", identity: "keeps promises", health: { answers: [false, false, false, false, false, false, false], details: "", clearance: false },
    emergency: { name: "Emergency contact", phone: "+441234567890" },
    consent: { signedName: "Test client", accepted: true, healthData: true, adult: true, version: "draft-v1", signedAt: undefined },
    story: { ...emptyProfile().story, want: "Be stronger", give: "Energy", matters: "Family", never: "Losing momentum", now: "A new chapter", why: "Personal coaching" },
    completed: true, setupStep: 33, ...overrides };
}
