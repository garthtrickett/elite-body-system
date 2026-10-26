import { isRecord, isText } from "../../shared/validation.ts";
import { parseMarketingStory, storyId } from "./story-data.ts";
import type { MarketingStory } from "./story-data.ts";

export const MARKETING_MATERIALS = { photosVideos: "Progress photos and videos", results: "Fitness results and progress measurements", testimonials: "My written or recorded testimonials" } as const;
export const MARKETING_CHANNELS = { website: "EBS websites and landing pages", socialMedia: "EBS social media posts", paidAds: "Paid digital advertising" } as const;
export const MARKETING_IDENTITY = { showName: "Include my name", showFace: "Show my face or other recognisable features" } as const;
export type MarketingChoice = keyof typeof MARKETING_MATERIALS | keyof typeof MARKETING_CHANNELS | keyof typeof MARKETING_IDENTITY;
export type MarketingChoices = Readonly<Record<MarketingChoice, boolean>>;
export type MarketingRelease = Readonly<{ version: string; approved: boolean; text: string }>;
export type MarketingPermission = Readonly<{ version: string; choices: MarketingChoices; limitations: string; accepted: boolean; adult: boolean; signedName: string; storyId?: string }>;
export type MarketingRecord = Readonly<{ revision: number; action: "granted" | "withdrawn" | "declined"; permission: MarketingPermission; release: MarketingRelease; recordedAt: string; story?: MarketingStory }>;
export type MarketingSnapshot = Readonly<{ release: MarketingRelease; revision: number; record: MarketingRecord | null; story?: MarketingStory | null; active?: readonly MarketingRecord[] }>;

export const DRAFT_MARKETING_RELEASE: MarketingRelease = {
  version: "ebs-media-testimonial-draft-2026-10-26-v3", approved: false,
  text: `Elite Body System — Optional Media & Testimonial Release

Your choice
This permission is optional and separate from fitness participation and private health-data consent. Refusing or withdrawing it does not change your access to the purchased fitness service or your ability to complete onboarding. Every permission starts unticked. Only the materials, identity options and channels you select are permitted.

What you permit
After you have made progress, EBS may invite you to review a specific story. If you opt in, you give Elite Body System, a United States business serving clients worldwide, non-exclusive permission to reproduce and display only the results, testimonial and identified files shown in that story, on your selected channels, to promote the EBS fitness system. Changing the story requires new approval. This does not give blanket permission for your assessment uploads or future progress. Progress measurements and transformation images can reveal health information; your separate affirmative choice expressly covers their selected marketing use. Permission does not extend to screening answers, diagnoses, medication details, emergency contacts, private messages or other people's information. EBS must honour your restrictions or seek new permission.

Where and how it may appear
Choose EBS websites, EBS social media and/or paid digital advertising separately. Selected material may be publicly visible worldwide and may be processed by the platform providers operating those channels. Their public audiences may copy or share it. EBS may crop, resize, caption or excerpt material for presentation, but must not alter your body shape, misrepresent your progress, change the meaning of your words or disclose an unselected identity. Without name permission EBS must omit your name; without recognisable-feature permission EBS must obscure your face and other identifying features. If adequate de-identification is not possible, EBS must not publish the material without further permission. This release does not allow sale or licensing of your material for unrelated third-party advertising, general-purpose AI training, or recording a whole coaching call.

Honest results and compensation
EBS must describe your experience accurately and comply with applicable advertising law, including substantiation and any disclosures about generally expected results. Your permission does not make an exceptional result typical. This release provides no payment or discount and requires no positive testimonial. Any separately agreed incentive or material relationship must be documented and disclosed where required. You keep ownership of material you own, and confirm that you are entitled to give permission for material you supply.

Changing your mind
You may review your approved stories and withdraw all marketing permission through Media preferences in your account, including before any new story is offered. You may also use the EBS contact route supplied with your service. Withdrawal stops future marketing use of the affected material; EBS must stop affected paid campaigns and remove affected material from digital channels it controls. EBS cannot guarantee removal of copies independently shared by third parties or recall material already distributed. Withdrawal does not make earlier lawful use unlawful. EBS may keep a limited consent/withdrawal record to document and honour your choices, subject to applicable privacy law.

Your acknowledgement
Before agreeing, read EBS's current privacy notice for its privacy contact, relevant recipients, retention and international-processing arrangements. This is not a blanket waiver of privacy or consumer rights, and does not authorise undisclosed uses or replace legally required transfer safeguards. The approval checkbox expressly signs this document version and the specific story under the full name shown beside it; you can correct that name before approving. You confirm you are at least 18 and legally able to make this choice where you live. You can request a copy of your recorded permission.`,
};

export function emptyMarketingPermission(version = DRAFT_MARKETING_RELEASE.version): MarketingPermission {
  return { version, choices: { photosVideos: false, results: false, testimonials: false, website: false, socialMedia: false, paidAds: false, showName: false, showFace: false }, limitations: "", accepted: false, adult: false, signedName: "" };
}
export function emptyMarketingSnapshot(): MarketingSnapshot { return { release: DRAFT_MARKETING_RELEASE, revision: 0, record: null, story: null, active: [] }; }
export function hasMarketingChoices(choices: MarketingChoices): boolean { return Object.values(choices).some(Boolean); }
export function marketingGrantProblem(permission: MarketingPermission): string | null {
  if (!hasMarketingChoices(permission.choices)) return null;
  if (permission.storyId && !Object.keys(MARKETING_CHANNELS).some(key => permission.choices[key as keyof typeof MARKETING_CHANNELS])) return "Choose at least one channel for this story, or select Not now.";
  if (!Object.keys(MARKETING_MATERIALS).some(key => permission.choices[key as keyof typeof MARKETING_MATERIALS]) || !Object.keys(MARKETING_CHANNELS).some(key => permission.choices[key as keyof typeof MARKETING_CHANNELS])) return "Choose at least one type of material and one marketing channel, or leave every choice unticked.";
  if (!permission.accepted || !permission.adult || !permission.signedName.trim()) return "Read the optional release, confirm your adult declaration and enter your full name to give marketing permission.";
  return null;
}
export function parseMarketingRelease(value: unknown): MarketingRelease | undefined {
  return isRecord(value) && isText(value.version, 100) && !!value.version.trim() && typeof value.approved === "boolean" && isText(value.text, 20000) && !!value.text.trim()
    ? { version: value.version.trim(), approved: value.approved, text: value.text.trim() } : undefined;
}
export function parseMarketingPermission(value: unknown): MarketingPermission | undefined {
  if (!isRecord(value) || !isText(value.version, 100) || !isRecord(value.choices) || !isText(value.limitations, 2000) || !isText(value.signedName, 100) || typeof value.accepted !== "boolean" || typeof value.adult !== "boolean" || value.storyId !== undefined && !storyId(value.storyId)) return undefined;
  const choices = value.choices;
  const keys = Object.keys(emptyMarketingPermission().choices) as MarketingChoice[];
  if (!keys.every(key => typeof choices[key] === "boolean")) return undefined;
  return { version: value.version.trim(), choices: Object.fromEntries(keys.map(key => [key, choices[key]])) as MarketingChoices, limitations: value.limitations.trim(), signedName: value.signedName.trim(), accepted: value.accepted, adult: value.adult, ...(storyId(value.storyId) ? { storyId: value.storyId } : {}) };
}
export function parseMarketingRecord(value: unknown): MarketingRecord | undefined {
  if (!isRecord(value) || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 1 || !["granted", "withdrawn", "declined"].includes(String(value.action)) || !isText(value.recordedAt, 100) || !Number.isFinite(Date.parse(value.recordedAt))) return undefined;
  const permission = parseMarketingPermission(value.permission), release = parseMarketingRelease(value.release);
  if (!permission || !release || permission.version !== release.version) return undefined;
  if (value.action === "granted" ? !release.approved || !hasMarketingChoices(permission.choices) || !!marketingGrantProblem(permission) : hasMarketingChoices(permission.choices) || permission.accepted) return undefined;
  const story = value.story === undefined ? undefined : parseMarketingStory(value.story);
  if (value.story !== undefined && !story || permission.storyId && story?.id !== permission.storyId) return undefined;
  return { revision: value.revision, action: value.action as MarketingRecord["action"], permission, release, recordedAt: value.recordedAt, ...(story ? { story } : {}) };
}
export function parseMarketingSnapshot(value: unknown): MarketingSnapshot | undefined {
  if (!isRecord(value) || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 0) return undefined;
  const revision = value.revision;
  const release = parseMarketingRelease(value.release), record = value.record === null ? null : parseMarketingRecord(value.record);
  const story = value.story === undefined || value.story === null ? null : parseMarketingStory(value.story);
  const active = value.active === undefined ? record?.action === "granted" ? [record] : [] : Array.isArray(value.active) ? value.active.map(parseMarketingRecord) : undefined;
  return release && record !== undefined && story !== undefined && active?.every((r): r is MarketingRecord => !!r && r.action === "granted" && r.revision <= revision) && (record ? record.revision === revision : revision === 0) ? { release, record, revision, story, active } : undefined;
}
export function marketingDraft(snapshot: MarketingSnapshot): MarketingPermission {
  const record = snapshot.story ? snapshot.active?.find(r => r.story?.id === snapshot.story!.id) : snapshot.record;
  return record?.action === "granted" && record.release.version === snapshot.release.version && (!snapshot.story || record.story?.id === snapshot.story.id) ? record.permission : { ...emptyMarketingPermission(snapshot.release.version), ...(snapshot.story ? { storyId: snapshot.story.id } : {}) };
}
export function activeMarketing(records: readonly MarketingRecord[]): readonly MarketingRecord[] {
  const active: MarketingRecord[] = [], seen = new Set<string>();
  for (const record of records) {
    if (record.action === "withdrawn") break;
    const key = record.story?.id ?? "legacy";
    if (record.action === "granted" && !seen.has(key)) { seen.add(key); active.push(record); }
  }
  return active;
}
