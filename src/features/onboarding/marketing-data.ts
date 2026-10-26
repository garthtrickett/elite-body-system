import { isRecord, isText } from "../../shared/validation.ts";

export const MARKETING_MATERIALS = { photosVideos: "Progress photos and videos", results: "Fitness results and progress measurements", testimonials: "My written or recorded testimonials" } as const;
export const MARKETING_CHANNELS = { website: "EBS websites and landing pages", socialMedia: "EBS social media posts", paidAds: "Paid digital advertising" } as const;
export const MARKETING_IDENTITY = { showName: "Include my name", showFace: "Show my face or other recognisable features" } as const;
export type MarketingChoice = keyof typeof MARKETING_MATERIALS | keyof typeof MARKETING_CHANNELS | keyof typeof MARKETING_IDENTITY;
export type MarketingChoices = Readonly<Record<MarketingChoice, boolean>>;
export type MarketingRelease = Readonly<{ version: string; approved: boolean; text: string }>;
export type MarketingPermission = Readonly<{ version: string; choices: MarketingChoices; limitations: string; accepted: boolean; adult: boolean; signedName: string }>;
export type MarketingRecord = Readonly<{ revision: number; action: "granted" | "withdrawn" | "declined"; permission: MarketingPermission; release: MarketingRelease; recordedAt: string }>;
export type MarketingSnapshot = Readonly<{ release: MarketingRelease; revision: number; record: MarketingRecord | null }>;

export const DRAFT_MARKETING_RELEASE: MarketingRelease = {
  version: "ebs-media-testimonial-draft-2026-10-26-v2", approved: false,
  text: `Elite Body System — Optional Media & Testimonial Release

Your choice
This permission is optional and separate from fitness participation and private health-data consent. Refusing or withdrawing it does not change your access to the purchased fitness service or your ability to complete onboarding. Every permission starts unticked. Only the materials, identity options and channels you select are permitted.

What you permit
If you opt in, you give Elite Body System, a United States business serving clients worldwide, a non-exclusive permission to reproduce and display the selected categories of material you provide about your EBS experience for promoting the EBS fitness system. Progress measurements and transformation images can reveal health information; your separate affirmative choice expressly covers their selected marketing use. Permission does not extend to your screening answers, diagnoses, medication details, emergency contact, private messages or other people's information. Please describe any specific material or restrictions in the limitations field. EBS must honour those restrictions or seek new permission.

Where and how it may appear
Choose EBS websites, EBS social media and/or paid digital advertising separately. Selected material may be publicly visible worldwide and may be processed by the platform providers operating those channels. Their public audiences may copy or share it. EBS may crop, resize, caption or excerpt material for presentation, but must not alter your body shape, misrepresent your progress, change the meaning of your words or disclose an unselected identity. Without name permission EBS must omit your name; without recognisable-feature permission EBS must obscure your face and other identifying features. If adequate de-identification is not possible, EBS must not publish the material without further permission. This release does not allow sale or licensing of your material for unrelated third-party advertising, general-purpose AI training, or recording a whole coaching call.

Honest results and compensation
EBS must describe your experience accurately and comply with applicable advertising law, including substantiation and any disclosures about generally expected results. Your permission does not make an exceptional result typical. This release provides no payment or discount and requires no positive testimonial. Any separately agreed incentive or material relationship must be documented and disclosed where required. You keep ownership of material you own, and confirm that you are entitled to give permission for material you supply.

Changing your mind
You may change your choices or withdraw all marketing permission in Fitness Participation Agreement, including after onboarding is complete. You may also use the EBS contact route supplied with your service. Withdrawal stops future marketing use of the affected material; EBS must stop affected paid campaigns and remove affected material from digital channels it controls. EBS cannot guarantee removal of copies independently shared by third parties or recall material already distributed. Withdrawal does not make earlier lawful use unlawful. EBS may keep a limited consent/withdrawal record to document and honour your choices, subject to applicable privacy law.

Your acknowledgement
Before agreeing, read EBS's current privacy notice for its privacy contact, relevant recipients, retention and international-processing arrangements. This is not a blanket waiver of privacy or consumer rights, and does not authorise undisclosed uses or replace legally required transfer safeguards. By confirming the separate release checkbox and typing your full name, you expressly permit only your selected uses and intend an electronic acknowledgement of this document version. You confirm you are at least 18 and legally able to make this choice where you live. You can request a copy of your recorded permission.`,
};

export function emptyMarketingPermission(version = DRAFT_MARKETING_RELEASE.version): MarketingPermission {
  return { version, choices: { photosVideos: false, results: false, testimonials: false, website: false, socialMedia: false, paidAds: false, showName: false, showFace: false }, limitations: "", accepted: false, adult: false, signedName: "" };
}
export function emptyMarketingSnapshot(): MarketingSnapshot { return { release: DRAFT_MARKETING_RELEASE, revision: 0, record: null }; }
export function hasMarketingChoices(choices: MarketingChoices): boolean { return Object.values(choices).some(Boolean); }
export function marketingGrantProblem(permission: MarketingPermission): string | null {
  if (!hasMarketingChoices(permission.choices)) return null;
  if (!Object.keys(MARKETING_MATERIALS).some(key => permission.choices[key as keyof typeof MARKETING_MATERIALS]) || !Object.keys(MARKETING_CHANNELS).some(key => permission.choices[key as keyof typeof MARKETING_CHANNELS])) return "Choose at least one type of material and one marketing channel, or leave every choice unticked.";
  if (!permission.accepted || !permission.adult || !permission.signedName.trim()) return "Read the optional release, confirm your adult declaration and enter your full name to give marketing permission.";
  return null;
}
export function parseMarketingRelease(value: unknown): MarketingRelease | undefined {
  return isRecord(value) && isText(value.version, 100) && !!value.version.trim() && typeof value.approved === "boolean" && isText(value.text, 20000) && !!value.text.trim()
    ? { version: value.version.trim(), approved: value.approved, text: value.text.trim() } : undefined;
}
export function parseMarketingPermission(value: unknown): MarketingPermission | undefined {
  if (!isRecord(value) || !isText(value.version, 100) || !isRecord(value.choices) || !isText(value.limitations, 2000) || !isText(value.signedName, 100) || typeof value.accepted !== "boolean" || typeof value.adult !== "boolean") return undefined;
  const choices = value.choices;
  const keys = Object.keys(emptyMarketingPermission().choices) as MarketingChoice[];
  if (!keys.every(key => typeof choices[key] === "boolean")) return undefined;
  return { version: value.version.trim(), choices: Object.fromEntries(keys.map(key => [key, choices[key]])) as MarketingChoices, limitations: value.limitations.trim(), signedName: value.signedName.trim(), accepted: value.accepted, adult: value.adult };
}
export function parseMarketingRecord(value: unknown): MarketingRecord | undefined {
  if (!isRecord(value) || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 1 || !["granted", "withdrawn", "declined"].includes(String(value.action)) || !isText(value.recordedAt, 100) || !Number.isFinite(Date.parse(value.recordedAt))) return undefined;
  const permission = parseMarketingPermission(value.permission), release = parseMarketingRelease(value.release);
  if (!permission || !release || permission.version !== release.version) return undefined;
  if (value.action === "granted" ? !release.approved || !hasMarketingChoices(permission.choices) || !!marketingGrantProblem(permission) : hasMarketingChoices(permission.choices) || permission.accepted) return undefined;
  return { revision: value.revision, action: value.action as MarketingRecord["action"], permission, release, recordedAt: value.recordedAt };
}
export function parseMarketingSnapshot(value: unknown): MarketingSnapshot | undefined {
  if (!isRecord(value) || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 0) return undefined;
  const release = parseMarketingRelease(value.release), record = value.record === null ? null : parseMarketingRecord(value.record);
  return release && record !== undefined && (record ? record.revision === value.revision : value.revision === 0) ? { release, record, revision: value.revision } : undefined;
}
export function marketingDraft(snapshot: MarketingSnapshot): MarketingPermission {
  return snapshot.record?.action === "granted" && snapshot.record.release.version === snapshot.release.version ? snapshot.record.permission : emptyMarketingPermission(snapshot.release.version);
}
