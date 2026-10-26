import { isRecord, isText } from "../../shared/validation.ts";
import { err, ok } from "../../shared/result.ts";
import type { ClientResult } from "../../shared/client-result.ts";

export const SECTIONS = ["welcome", "questionnaire", "audit", "communication", "measurements", "lifestyle", "rhythm", "call"] as const;
export type Section = typeof SECTIONS[number];
export const SECTION_LABELS: Readonly<Record<Section, string>> = { welcome: "Welcome video", questionnaire: "Start Point Form", audit: "Physical audit · week one", communication: "Communication", measurements: "Your measurements", lifestyle: "Lifestyle audit", rhythm: "Rhythm for success", call: "Your onboarding call" };
const LEGACY_GOALS = ["mobility", "strength", "size", "energy", "cardio", "get-lean", "reduce-pain"] as const;
export const GOALS = [...LEGACY_GOALS, "consistency", "health-markers"] as const;
export type Goal = typeof GOALS[number];
export const GOAL_LABELS: Readonly<Record<Goal, string>> = { mobility: "Mobility", strength: "Strength", size: "Gain muscle", energy: "Energy", cardio: "Get fit", "get-lean": "Get lean", "reduce-pain": "Reduce pain", consistency: "Consistency", "health-markers": "Improve health markers" };
export const QUESTIONS = {
  transformation: "What would be an incredible result for you over the next 180 days? What do you want to achieve?",
  now: "What are your main reasons for doing this now? Your “WHY”?",
  motivation: "What motivates you to stay committed to your fitness to achieve that result?",
  struggles: "What in particular struggles need solving to achieve your desired result?",
  choice: "Why did you choose EBS to solve this over other options?",
  finalThought: "What was the final thought that made you decide to sign up?",
  experience: "What previous experience do you have with personal training or fitness programs and why did you stop?",
  success: "When have you succeeded physically in the past, and what made you succeed?",
  belief: "Do you believe you're capable of achieving and maintaining Elite Body composition and Physical Performance for your age? If not, why not? If yes, why yes?",
} as const;
export type Question = keyof typeof QUESTIONS;
export const MEASUREMENTS = { bicepLeft: "Left bicep", bicepRight: "Right bicep", hamLeft: "Left ham / thigh", hamRight: "Right ham / thigh", forearmLeft: "Left forearm", forearmRight: "Right forearm", waist: "Waistline", neck: "Neck" } as const;
export type Measurement = keyof typeof MEASUREMENTS;
export const LIFESTYLE = { diet: "What do you typically eat?", feeling: "How does your diet make you feel?", symptoms: "Do you experience bloating, inflammation, diarrhoea or other digestive symptoms?", sleep: "Tell Harry about your sleep hygiene and routine." } as const;
export type Lifestyle = keyof typeof LIFESTYLE;
export type OnboardingAnswers = Readonly<{
  acknowledged: Readonly<Record<"welcome" | "communication" | "rhythm", boolean>>;
  questionnaire: Readonly<Record<Question, string>>;
  goals: readonly Goal[]; goalsConfirmed: boolean;
  health: readonly (boolean | null)[]; healthDetails: string;
  consent: Readonly<{ version: string; signedName: string; accepted: boolean; healthData: boolean; adult: boolean }>;
  cardio: "run" | "cross-trainer" | "bike";
  measurements: Readonly<Record<Measurement, string>>;
  lifestyle: Readonly<Record<Lifestyle, string>>;
  routine: Readonly<{ name: string; timezone: string; weight: string; trainingDays: readonly number[]; restDay: number; equipment: string; emergencyName: string; emergencyPhone: string }>;
}>;
export type MobilityTest = Readonly<{ id: string; label: string; instructions: string; videoUrl: string }>;
export type OnboardingContent = Readonly<{
  version: string; approved: boolean; welcomeText: string; communication: string; contactUrl: string;
  consentVersion: string; consentText: string; parqVersion: string; healthQuestions: readonly string[];
  welcomeVideo: string; strengthVideo: string; cardioVideo: string; measurementVideo: string;
  cardioInstructions: string; measurementInstructions: string; techniqueInstructions: string; rhythmText: string;
  mobility: readonly MobilityTest[]; bookingUrl: string;
}>;
export type MediaSummary = Readonly<{ id: string; slot: string; mediaType: string; size: number; status: "pending" | "ready" }>;
export type Booking = Readonly<{ providerId: string; eventVersion: number; status: "confirmed" | "cancelled"; startsAt: string; timezone: string; meetUrl: string }>;
export type Resolution = Readonly<{ requirement: string; reason: string; resolvedBy: string; evidence: string }>;
export type OnboardingSnapshot = Readonly<{
  version: "harry-v2"; revision: number; answers: OnboardingAnswers; content: OnboardingContent;
  media: readonly MediaSummary[]; previousMedia?: readonly MediaSummary[]; booking: Booking | null; resolutions: readonly Resolution[];
  completedAt: string | null; consentSignedAt: string | null; missing: Readonly<Record<Section, readonly string[]>>;
}>;

export function emptyAnswers(): OnboardingAnswers {
  return { acknowledged: { welcome: false, communication: false, rhythm: false },
    questionnaire: { transformation: "", motivation: "", experience: "", choice: "", now: "", finalThought: "", success: "", struggles: "", belief: "" },
    goals: [...GOALS], goalsConfirmed: false, health: Array.from({ length: 7 }, () => null), healthDetails: "",
    consent: { version: "", signedName: "", accepted: false, healthData: false, adult: false }, cardio: "run",
    measurements: { bicepLeft: "", bicepRight: "", hamLeft: "", hamRight: "", forearmLeft: "", forearmRight: "", waist: "", neck: "" },
    lifestyle: { diet: "", feeling: "", symptoms: "", sleep: "" },
    routine: { name: "", timezone: "UTC", weight: "", trainingDays: [1, 2, 4, 5], restDay: 0, equipment: "", emergencyName: "", emergencyPhone: "" } };
}
export function emptyContent(): OnboardingContent {
  return { version: "unconfigured", approved: false, welcomeText: "", communication: "", contactUrl: "", consentVersion: "", consentText: "", parqVersion: "", healthQuestions: [], welcomeVideo: "", strengthVideo: "", cardioVideo: "", measurementVideo: "", cardioInstructions: "", measurementInstructions: "", techniqueInstructions: "", rhythmText: "", mobility: [], bookingUrl: "" };
}
export function isHttps(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}
export function validTimezone(value: string): boolean {
  if (!value.trim()) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}
export function measurementProblem(input: Readonly<{ field: Measurement; value: string }>): string {
  const value = input.value.trim();
  return !/^\d+(\.\d{1,2})?$/.test(value) || Number(value) <= 0 || Number(value) > 300 ? `Enter ${MEASUREMENTS[input.field].toLowerCase()} in cm (greater than 0, up to 300).` : "";
}
export function parseAnswers(value: unknown): ClientResult<OnboardingAnswers> {
  const invalid = () => err({ code: "invalid_input", message: "Check your onboarding answers and field lengths." } as const);
  if (!isRecord(value) || !isRecord(value.acknowledged) || !isRecord(value.questionnaire) || !isRecord(value.measurements) || !isRecord(value.lifestyle) || !isRecord(value.routine) || !isRecord(value.consent)) return invalid();
  const { acknowledged, questionnaire, measurements, lifestyle, routine, consent } = value;
  const goals: readonly unknown[] = Array.isArray(value.goals) ? value.goals : [];
  // Preserve the seven-goal order, append the new choices and require confirmation again.
  const legacyRanking = goals.length === LEGACY_GOALS.length && LEGACY_GOALS.every(goal => goals.includes(goal));
  // Saved questionnaires may predate the finalThought and belief prompts.
  if (!["welcome", "communication", "rhythm"].every(key => typeof acknowledged[key] === "boolean") ||
      !Object.keys(QUESTIONS).every(key => ((key === "finalThought" || key === "belief") && questionnaire[key] === undefined) || isText(questionnaire[key], 2000)) || !Object.keys(MEASUREMENTS).every(key => isText(measurements[key], 12)) || !Object.keys(LIFESTYLE).every(key => isText(lifestyle[key], 2000)) ||
      !Array.isArray(value.goals) || (!legacyRanking && goals.length !== GOALS.length) || new Set(goals).size !== goals.length || !goals.every(goal => typeof goal === "string" && GOALS.includes(goal as Goal)) || typeof value.goalsConfirmed !== "boolean" ||
      !Array.isArray(value.health) || value.health.length !== 7 || !value.health.every(answer => answer === null || typeof answer === "boolean") || !isText(value.healthDetails, 2000) || !["run", "cross-trainer", "bike"].includes(String(value.cardio)) ||
      !isText(consent.version, 100) || !isText(consent.signedName, 100) || !["accepted", "healthData", "adult"].every(key => typeof consent[key] === "boolean") ||
      !isText(routine.name, 100) || !isText(routine.timezone, 100) || !isText(routine.weight, 12) || !isText(routine.equipment, 2000) || !isText(routine.emergencyName, 100) || !isText(routine.emergencyPhone, 50) ||
      !Array.isArray(routine.trainingDays) || routine.trainingDays.length > 4 || new Set(routine.trainingDays).size !== routine.trainingDays.length || !routine.trainingDays.every(day => Number.isInteger(day) && day >= 0 && day <= 6) || typeof routine.restDay !== "number" || !Number.isInteger(routine.restDay) || routine.restDay < 0 || routine.restDay > 6) return invalid();
  if (!validTimezone(routine.timezone as string)) return err({ code: "invalid_input", message: "Enter a valid time zone, for example Europe/London." });
  return ok({ acknowledged: { welcome: acknowledged.welcome as boolean, communication: acknowledged.communication as boolean, rhythm: acknowledged.rhythm as boolean },
    questionnaire: Object.fromEntries(Object.keys(QUESTIONS).map(key => [key, typeof questionnaire[key] === "string" ? questionnaire[key].trim() : ""])) as OnboardingAnswers["questionnaire"],
    measurements: Object.fromEntries(Object.keys(MEASUREMENTS).map(key => [key, (measurements[key] as string).trim()])) as OnboardingAnswers["measurements"],
    lifestyle: Object.fromEntries(Object.keys(LIFESTYLE).map(key => [key, (lifestyle[key] as string).trim()])) as OnboardingAnswers["lifestyle"],
    goals: [...goals, ...GOALS.filter(goal => !goals.includes(goal))] as Goal[], goalsConfirmed: value.goalsConfirmed && !legacyRanking, health: [...value.health] as (boolean | null)[], healthDetails: value.healthDetails.trim(), cardio: value.cardio as OnboardingAnswers["cardio"],
    consent: { version: consent.version as string, signedName: (consent.signedName as string).trim(), accepted: consent.accepted as boolean, healthData: consent.healthData as boolean, adult: consent.adult as boolean },
    routine: { name: (routine.name as string).trim(), timezone: routine.timezone as string, weight: (routine.weight as string).trim(), equipment: (routine.equipment as string).trim(), emergencyName: (routine.emergencyName as string).trim(), emergencyPhone: (routine.emergencyPhone as string).trim(), trainingDays: [...routine.trainingDays] as number[], restDay: routine.restDay } });
}

export function parseContent(value: unknown): OnboardingContent | undefined {
  if (!isRecord(value) || typeof value.approved !== "boolean" || !Array.isArray(value.mobility) || value.mobility.length > 20 || !Array.isArray(value.healthQuestions) || ![0, 7].includes(value.healthQuestions.length) || (value.approved && value.healthQuestions.length !== 7) || !value.healthQuestions.every(question => isText(question, 1000) && question.trim())) return undefined;
  const strings = ["version", "welcomeText", "communication", "contactUrl", "consentVersion", "consentText", "parqVersion", "welcomeVideo", "strengthVideo", "cardioVideo", "measurementVideo", "cardioInstructions", "measurementInstructions", "techniqueInstructions", "rhythmText", "bookingUrl"] as const;
  if (!strings.every(key => isText(value[key], key.endsWith("Video") || key.endsWith("Url") ? 2048 : 20000))) return undefined;
  for (const key of ["welcomeVideo", "strengthVideo", "cardioVideo", "measurementVideo", "contactUrl", "bookingUrl"] as const) if (value[key] !== "" && !isHttps(value[key])) return undefined;
  const mobility: MobilityTest[] = [];
  for (const item of value.mobility) {
    if (!isRecord(item) || typeof item.id !== "string" || !/^[a-z][a-z0-9-]{0,40}$/.test(item.id) || !isText(item.label, 200) || !item.label.trim() || !isText(item.instructions, 4000) || !isHttps(item.videoUrl)) return undefined;
    mobility.push({ id: item.id, label: item.label, instructions: item.instructions, videoUrl: item.videoUrl });
  }
  if (new Set(mobility.map(item => item.id)).size !== mobility.length) return undefined;
  const fields = Object.fromEntries(strings.map(key => [key, value[key]])) as Readonly<Record<typeof strings[number], string>>;
  if (fields.version.length > 100 || fields.consentVersion.length > 100 || fields.parqVersion.length > 100) return undefined;
  if (value.approved && (strings.some(key => !fields[key].trim()) || !mobility.length || mobility.some(item => !item.instructions.trim()))) return undefined;
  return { ...fields, approved: value.approved, healthQuestions: [...value.healthQuestions] as string[], mobility };
}

export function mediaSlots(content: OnboardingContent): readonly Readonly<{ id: string; label: string; kind: "video" | "image" }>[] {
  return [...content.mobility.map(test => ({ id: `mobility:${test.id}`, label: test.label, kind: "video" as const })),
    ...["pushups", "pullups", "squats"].map(id => ({ id: `strength:${id}`, label: { pushups: "Push-ups", pullups: "Pull-ups", squats: "Squats" }[id] ?? id, kind: "video" as const })),
    { id: "cardio:screenshot", label: "Cardio result screenshot", kind: "image" },
    ...["front", "back", "side"].map(id => ({ id: `photo:${id}`, label: `${id[0]?.toUpperCase()}${id.slice(1)} photo`, kind: "image" as const }))];
}

export function missingRequirements(input: Readonly<{ answers: OnboardingAnswers; content: OnboardingContent; media: readonly MediaSummary[]; booking: Booking | null; resolutions: readonly Resolution[] }>): Readonly<Record<Section, readonly string[]>> {
  const { answers: a, content: c } = input;
  const missing: Record<Section, string[]> = { welcome: [], questionnaire: [], audit: [], communication: [], measurements: [], lifestyle: [], rhythm: [], call: [] };
  const text = (section: Section, value: string, message: string) => { if (!value.trim()) missing[section].push(message); };
  for (const section of SECTIONS) if (!c.approved) missing[section].push("Harry’s approved onboarding content is not configured yet.");
  for (const section of ["welcome", "communication", "rhythm"] as const) if (!a.acknowledged[section]) missing[section].push("Read or watch the guidance and confirm you understand.");
  if (!c.welcomeVideo || !c.welcomeText) missing.welcome.push("Welcome video and introduction are needed.");
  text("welcome", a.routine.name, "Enter your name.");
  if (!validTimezone(a.routine.timezone)) missing.welcome.push("Enter a valid time zone, for example Europe/London.");
  for (const key of Object.keys(QUESTIONS) as Question[]) text("questionnaire", a.questionnaire[key], QUESTIONS[key]);
  if (!a.goalsConfirmed) missing.questionnaire.push("Confirm your goal ranking.");
  if (!c.consentVersion || !c.consentText || !c.parqVersion || c.healthQuestions.length !== 7) missing.audit.push("Approved consent and health screening are needed.");
  if (a.consent.version !== c.consentVersion || !a.consent.accepted || !a.consent.healthData || !a.consent.adult || !a.consent.signedName) missing.audit.push("Read, acknowledge and sign the current consent.");
  if (a.health.some(answer => answer === null)) missing.audit.push("Answer every health screening question.");
  if (a.health.some(Boolean)) {
    text("audit", a.healthDetails, "Explain your health concerns to Harry.");
    if (!hasResolution({ ...input, requirement: "health-clearance" }) && !hasResolution({ ...input, requirement: "health-audit-alternative" })) missing.audit.push("Contact Harry before exercising: health clearance or an approved alternative is needed.");
  }
  if (!c.mobility.length || !c.strengthVideo || !c.cardioVideo || !c.cardioInstructions) missing.audit.push("Harry’s physical-audit protocol and videos are needed.");
  if (!a.routine.emergencyName || a.routine.emergencyPhone.replace(/\D/g, "").length < 7) missing.audit.push("Enter your emergency contact’s name and phone number.");
  for (const slot of mediaSlots(c)) {
    if (!input.media.some(item => item.slot === slot.id && item.status === "ready") && !hasResolution({ ...input, requirement: slot.id })) missing[slot.id.startsWith("photo:") ? "measurements" : "audit"].push(`Submit ${slot.label.toLowerCase()}.`);
  }
  if (!c.communication || !c.contactUrl) missing.communication.push("Harry’s communication instructions and contact link are needed.");
  if (!c.measurementVideo || !c.measurementInstructions) missing.measurements.push("Measurement guidance is needed.");
  for (const key of Object.keys(MEASUREMENTS) as Measurement[]) { const problem = measurementProblem({ field: key, value: a.measurements[key] }); if (problem) missing.measurements.push(problem); }
  if (!a.routine.weight || !Number.isFinite(Number(a.routine.weight)) || Number(a.routine.weight) < 30 || Number(a.routine.weight) > 300) missing.measurements.push("Enter starting body weight between 30 and 300 kg.");
  if (a.routine.trainingDays.length !== 4 || a.routine.trainingDays.includes(a.routine.restDay)) missing.lifestyle.push("Choose four training days and a separate rest day.");
  text("lifestyle", a.routine.equipment, "Describe your training space and equipment.");
  for (const key of Object.keys(LIFESTYLE) as Lifestyle[]) text("lifestyle", a.lifestyle[key], LIFESTYLE[key]);
  if (!c.rhythmText || !c.techniqueInstructions) missing.rhythm.push("Weekly feedback and filming guidance are needed.");
  if (!c.bookingUrl) missing.call.push("Harry’s booking link is not configured yet.");
  if (!input.booking || input.booking.status !== "confirmed" || !isMeetUrl(input.booking.meetUrl)) missing.call.push("Book your Google Meet call and wait for confirmation.");
  return missing;
}
export function resolutionEvidence(input: Readonly<{ answers: OnboardingAnswers; content: OnboardingContent; requirement: string }>): string {
  return JSON.stringify([input.content.version, input.requirement.startsWith("health-") ? input.answers.health : null, input.requirement.startsWith("health-") ? input.answers.healthDetails : null]);
}
export function hasResolution(input: Readonly<{ answers: OnboardingAnswers; content: OnboardingContent; resolutions: readonly Resolution[]; requirement: string }>): boolean {
  return input.resolutions.some(item => item.requirement === input.requirement && item.evidence === resolutionEvidence(input));
}
export function assessmentSubmissionProblem(input: Readonly<{ answers: OnboardingAnswers; content: OnboardingContent; resolutions: readonly Resolution[]; slot: string }>): string | null {
  const { answers: a, content: c } = input;
  if (!c.approved || !a.consent.accepted || a.consent.version !== c.consentVersion || !a.consent.healthData || !a.consent.adult || !a.consent.signedName) return "Save your signed consent and agreement to storing health information before uploading.";
  if (!input.slot.startsWith("photo:") && (a.health.some(answer => answer === null) || (a.health.some(Boolean) && !hasResolution({ ...input, requirement: "health-clearance" })))) return "Complete health screening and contact Harry about any health concerns before the physical audit.";
  return null;
}
export function isMeetUrl(value: unknown): value is string {
  if (!isHttps(value)) return false;
  const url = new URL(value);
  return url.origin === "https://meet.google.com" && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(url.pathname) && !url.search && !url.hash;
}

export function parseSnapshot(value: unknown): OnboardingSnapshot | undefined {
  if (!isRecord(value) || value.version !== "harry-v2" || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.media) || !Array.isArray(value.resolutions) || ![value.completedAt, value.consentSignedAt].every(date => date === null || (typeof date === "string" && Number.isFinite(Date.parse(date))))) return undefined;
  const answers = parseAnswers(value.answers), content = parseContent(value.content);
  if (!answers.ok || !content) return undefined;
  if (value.previousMedia !== undefined && !Array.isArray(value.previousMedia)) return undefined;
  const media: MediaSummary[] = [], previousMedia: MediaSummary[] = [], resolutions: Resolution[] = [];
  for (const [items, target] of [[value.media, media], [value.previousMedia ?? [], previousMedia]] as const) for (const item of items) {
    if (!isRecord(item) || !isText(item.id, 100) || !isText(item.slot, 100) || !isText(item.mediaType, 100) || typeof item.size !== "number" || !Number.isSafeInteger(item.size) || item.size < 1 || !["pending", "ready"].includes(String(item.status))) return undefined;
    target.push({ id: item.id, slot: item.slot, mediaType: item.mediaType, size: item.size, status: item.status as MediaSummary["status"] });
  }
  for (const item of value.resolutions) {
    if (!isRecord(item) || !isText(item.requirement, 100) || !isText(item.reason, 2000) || !isText(item.resolvedBy, 200) || !isText(item.evidence, 10000)) return undefined;
    resolutions.push({ requirement: item.requirement, reason: item.reason, resolvedBy: item.resolvedBy, evidence: item.evidence });
  }
  let booking: Booking | null = null;
  if (value.booking !== null) {
    const b = value.booking;
    if (!isRecord(b) || !isText(b.providerId, 500) || typeof b.eventVersion !== "number" || !Number.isSafeInteger(b.eventVersion) || b.eventVersion < 0 || !["confirmed", "cancelled"].includes(String(b.status)) || !isText(b.startsAt, 100) || !Number.isFinite(Date.parse(b.startsAt)) || !isText(b.timezone, 100) || !isMeetUrl(b.meetUrl)) return undefined;
    booking = { providerId: b.providerId, eventVersion: b.eventVersion, status: b.status as Booking["status"], startsAt: b.startsAt, timezone: b.timezone, meetUrl: b.meetUrl };
  }
  const evidence = { answers: answers.value, content, media, booking, resolutions };
  return { version: "harry-v2", revision: value.revision, ...evidence, previousMedia, completedAt: value.completedAt as string | null, consentSignedAt: value.consentSignedAt as string | null, missing: missingRequirements(evidence) };
}
