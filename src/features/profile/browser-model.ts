import { parseProfile, targetProblem } from "./data.ts";
import type { ClientProfile, StoryField, Targets } from "./data.ts";
import { SETUP_STEPS, STORY_QUESTIONS } from "./onboarding-content.ts";

export type ProfileField = "name" | "timezone" | "equipment" | "workaround" | "anchor" | "identity" | "emergencyName" | "emergencyPhone" | "healthDetails" | "signedName" | "startingWeight";
export type ProfileUiModel = Readonly<{ draft: ClientProfile; targetDrafts: Readonly<Record<keyof Targets, string>>; error: string; targetErrors: Readonly<Partial<Record<keyof Targets, string>>>; validationAttempt: number; requestedSave: boolean }>;
export type ProfileProposal =
  | Readonly<{ kind: "fieldChanged"; field: ProfileField; value: string }>
  | Readonly<{ kind: "storyChanged"; field: StoryField; value: string }>
  | Readonly<{ kind: "targetChanged"; field: keyof Targets; value: string }>
  | Readonly<{ kind: "trainingDayToggled"; day: number }>
  | Readonly<{ kind: "restDayChanged"; day: number }>
  | Readonly<{ kind: "healthChanged"; index: number; yes: boolean }>
  | Readonly<{ kind: "consentChanged"; field: "accepted" | "healthData" | "adult"; value: boolean }>
  | Readonly<{ kind: "clearanceChanged"; value: boolean }>
  | Readonly<{ kind: "firstThoughtChanged" | "firstGoalChanged"; value: string }>
  | Readonly<{ kind: "next" | "back" | "save" | "complete" | "editSetup" | "saveHandled" }>;

export function initialProfileUi(profile: ClientProfile): ProfileUiModel {
  return { draft: profile, targetDrafts: { energy: String(profile.targets.energy), protein: String(profile.targets.protein), water: String(profile.targets.water), sleep: String(profile.targets.sleep), steps: String(profile.targets.steps) }, error: "", targetErrors: {}, validationAttempt: 0, requestedSave: false };
}

function stepError(model: ProfileUiModel): string {
  const d = model.draft, step = SETUP_STEPS[d.setupStep];
  if (step && step in STORY_QUESTIONS) {
    const question = STORY_QUESTIONS[step as StoryField];
    return !("optional" in question) && !d.story[step as StoryField].trim() ? "Please answer before continuing." : "";
  }
  if (step === "name" && !d.name.trim()) return "Tell Harry what to call you.";
  if (step === "week" && (d.trainingDays.length !== 4 || d.trainingDays.includes(d.restDay))) return "Choose four training days and a separate rest day.";
  if (step === "anchor" && !d.anchor.trim()) return "Choose when you’ll fill in your scorecard.";
  if (step === "parq" && d.health.answers.some(a => a === null)) return "Please answer each health question.";
  if (step === "parqMore" && !d.health.details.trim()) return "Describe what Harry should know.";
  if (step === "emergency" && (!d.emergency.name.trim() || d.emergency.phone.replace(/\D/g, "").length < 7)) return "Add an emergency contact’s name and phone number.";
  if (step === "consent" && (!d.consent.signedName.trim() || !d.consent.accepted || !d.consent.healthData || !d.consent.adult)) return "Read and acknowledge the draft, and enter your full name.";
  if (step === "scale" && !(d.startingWeight && d.startingWeight >= 30 && d.startingWeight <= 300)) return "Enter your starting weight in kg.";
  if (step === "identity" && !d.identity.trim()) return "Write who you’re becoming.";
  if (step === "win" && (!d.firstThought.trim() || !d.firstGoal.trim())) return "Capture a thought and choose one priority.";
  return "";
}

export function acceptProfileProposal(model: ProfileUiModel, proposal: ProfileProposal): ProfileUiModel {
  const d = model.draft;
  switch (proposal.kind) {
    case "fieldChanged": {
      const field = proposal.field, value = proposal.value;
      const draft = field === "emergencyName" ? { ...d, emergency: { ...d.emergency, name: value } }
        : field === "emergencyPhone" ? { ...d, emergency: { ...d.emergency, phone: value } }
        : field === "healthDetails" ? { ...d, health: { ...d.health, details: value } }
        : field === "signedName" ? { ...d, consent: { ...d.consent, signedName: value } }
        : field === "startingWeight" ? { ...d, startingWeight: value.trim() ? Number(value.replace(",", ".")) : undefined }
        : { ...d, [field]: value };
      return { ...model, draft, error: "" };
    }
    case "storyChanged": return { ...model, draft: { ...d, story: { ...d.story, [proposal.field]: proposal.value } }, error: "" };
    case "targetChanged": return { ...model, targetDrafts: { ...model.targetDrafts, [proposal.field]: proposal.value },
      targetErrors: { ...model.targetErrors, [proposal.field]: model.validationAttempt ? targetProblem({ field: proposal.field, value: Number(proposal.value) }) : "" }, error: "" };
    case "trainingDayToggled": {
      const days = d.trainingDays.includes(proposal.day) ? d.trainingDays.filter(day => day !== proposal.day) : d.trainingDays.length < 4 ? [...d.trainingDays, proposal.day] : d.trainingDays;
      return { ...model, draft: { ...d, trainingDays: days }, error: "" };
    }
    case "restDayChanged": return { ...model, draft: { ...d, restDay: proposal.day }, error: "" };
    case "healthChanged": return { ...model, draft: { ...d, health: { ...d.health, answers: d.health.answers.map((yes, i) => i === proposal.index ? proposal.yes : yes) } }, error: "" };
    case "clearanceChanged": return { ...model, draft: { ...d, health: { ...d.health, clearance: proposal.value } } };
    case "consentChanged": return { ...model, draft: { ...d, consent: { ...d.consent, [proposal.field]: proposal.value } }, error: "" };
    case "firstThoughtChanged": return { ...model, draft: { ...d, firstThought: proposal.value }, error: "" };
    case "firstGoalChanged": return { ...model, draft: { ...d, firstGoal: proposal.value }, error: "" };
    case "back": return { ...model, draft: { ...d, setupStep: Math.max(0, d.setupStep - 1) }, error: "" };
    case "editSetup": return { ...model, draft: { ...d, setupStep: 0 }, error: "" };
    case "saveHandled": return { ...model, requestedSave: false };
    case "next": {
      const error = stepError(model);
      if (error) return { ...model, error };
      let setupStep = Math.min(32, d.setupStep + 1);
      if (SETUP_STEPS[setupStep] === "parqMore" && !d.health.answers.some(Boolean)) setupStep++;
      return { ...model, draft: { ...d, setupStep }, requestedSave: true, error: "" };
    }
    case "save": case "complete": {
      const targetErrors = Object.fromEntries(Object.entries(model.targetDrafts).flatMap(([field, raw]) => {
        const problem = targetProblem({ field: field as keyof Targets, value: Number(raw) });
        return problem ? [[field, problem]] : [];
      }));
      if (Object.keys(targetErrors).length) return { ...model, targetErrors, validationAttempt: model.validationAttempt + 1, error: "Check the highlighted daily targets." };
      const targets = Object.fromEntries(Object.entries(model.targetDrafts).map(([key, value]) => [key, Number(value)]));
      const parsed = parseProfile({ ...d, targets, completed: proposal.kind === "complete" ? true : d.completed, setupStep: proposal.kind === "complete" ? 33 : d.setupStep });
      return parsed.ok ? { ...model, draft: parsed.value, requestedSave: true, error: "" } : { ...model, error: parsed.error.message };
    }
  }
}
