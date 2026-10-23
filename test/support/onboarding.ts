import { emptyAnswers, emptyContent } from "../../src/features/onboarding/index.ts";
import type { OnboardingContent, OnboardingAnswers, AssessmentStorage } from "../../src/features/onboarding/index.ts";
import { matchesMediaType } from "../../src/features/onboarding/storage.ts";

export function onboardingContent(): OnboardingContent {
  return { ...emptyContent(), version: "fixture-v2", approved: true, welcomeText: "Fixture welcome", communication: "Fixture coaching instructions", contactUrl: "https://example.test/contact",
    consentVersion: "fixture-consent", consentText: "TEST ONLY: consent fixture, not approved for clients.", parqVersion: "fixture-parq", healthQuestions: Array.from({ length: 7 }, (_, index) => `Fixture health question ${index + 1}`),
    welcomeVideo: "https://example.test/welcome.mp4", strengthVideo: "https://example.test/strength.mp4", cardioVideo: "https://example.test/cardio.mp4", measurementVideo: "https://example.test/measurements.mp4",
    cardioInstructions: "Fixture cardio protocol", measurementInstructions: "Fixture measurement locations", techniqueInstructions: "Fixture filming and trimming guidance", rhythmText: "Check-in feedback informs the next program.",
    mobility: [{ id: "reach", label: "Reach", instructions: "Fixture reach protocol", videoUrl: "https://example.test/reach.mp4" }], bookingUrl: "https://example.test/schedule" };
}
export function onboardingAnswers(): OnboardingAnswers {
  const empty = emptyAnswers();
  return { ...empty, acknowledged: { welcome: true, communication: true, rhythm: true }, questionnaire: { transformation: "A stronger 180 days", motivation: "Family", experience: "None", choice: "Coaching", now: "Ready", finalThought: "Ready to commit", success: "Walking regularly", struggles: "Time" },
    goalsConfirmed: true, health: [false, false, false, false, false, false, false], consent: { version: "fixture-consent", signedName: "Alex Example", accepted: true, healthData: true, adult: true },
    measurements: { bicepLeft: "30", bicepRight: "31", hamLeft: "50", hamRight: "51", forearmLeft: "24", forearmRight: "24", waist: "80", neck: "35" },
    lifestyle: { diet: "Regular meals", feeling: "Good", symptoms: "None", sleep: "Consistent bedtime" }, routine: { ...empty.routine, name: "Alex", timezone: "Europe/London", weight: "80", equipment: "Gym", emergencyName: "Sam", emergencyPhone: "+447000000000" } };
}
export const jpegBytes = Buffer.from([255, 216, 255, 224, ...Array.from({ length: 16 }, () => 0)]);
export const videoBytes = Buffer.from([0, 0, 0, 20, 102, 116, 121, 112, 109, 112, 52, 50, ...Array.from({ length: 16 }, () => 0)]);
export function memoryAssessmentStorage() {
  const objects = new Map<string, Readonly<{ bytes: Uint8Array; mediaType: string }>>();
  const pending = new Map<string, Readonly<{ key: string; mediaType: string; size: number }>>();
  const storage: AssessmentStorage = {
    async authorizeUpload(input) { const id = input.key.split("/").at(-1)!; pending.set(id, input); return { url: `https://uploads.example.test/${id}`, headers: { "Content-Type": input.mediaType } }; },
    async finalize({ pendingKey, readyKey, mediaType, size }) {
      const object = objects.get(pendingKey);
      if (!object || object.bytes.length !== size || object.mediaType !== mediaType || !matchesMediaType({ bytes: object.bytes, mediaType })) return false;
      objects.set(readyKey, object); objects.delete(pendingKey); return true;
    },
    async authorizeRead({ key }) { if (!objects.has(key)) throw new Error("Missing file"); return `https://uploads.example.test/read/${key.split("/").at(-1)}`; },
    async remove({ key }) { objects.delete(key); }, async listExpired() { return []; },
  };
  return { storage, objects, pending, put(id: string, bytes: Uint8Array) { const request = pending.get(id); if (!request) throw new Error("Missing request"); objects.set(request.key, { bytes, mediaType: request.mediaType }); } };
}
