import { isRecord, isText } from "../../shared/validation.ts";
import type { OnboardingAnswers, OnboardingContent } from "./data.ts";
import { healthScreeningProblem } from "./data.ts";

export const DOCUMENT_KINDS = ["parq", "informed", "participation", "coaching"] as const;
export type DocumentKind = typeof DOCUMENT_KINDS[number];
export type DocumentAcknowledgement = Readonly<{ version: string; signedName: string; accepted: boolean }>;
export type AdditionalAcknowledgements = Readonly<Record<Exclude<DocumentKind, "participation">, DocumentAcknowledgement>>;
export type LegalDocument = Readonly<{ version: string; title: string; text: string; approved: boolean }>;
export type LegalDocuments = Readonly<Record<DocumentKind, LegalDocument>>;
export type DocumentDates = Readonly<Record<DocumentKind, string | null>>;
export const emptyDocumentDates = (): DocumentDates => ({ parq: null, informed: null, participation: null, coaching: null });
export const emptyDocumentAcknowledgements = (): AdditionalAcknowledgements => ({ parq: { version: "", signedName: "", accepted: false }, informed: { version: "", signedName: "", accepted: false }, coaching: { version: "", signedName: "", accepted: false } });

// Original drafting. Approval is explicit and versioned; these are not executed
// contracts or the licensed PAR-Q+ instrument. No jurisdiction is invented.
export const DRAFT_DOCUMENTS: LegalDocuments = {
  parq: { version: "ebs-readiness-draft-2026-10-26-v2", title: "PAR-Q · Health screening", approved: false,
    text: "Elite Body System — Physical Activity Readiness Questionnaire\n\nAnswer each question accurately before starting physical assessments or training. Explain any Yes answer and confirm that a registered physician has cleared you for physical activity in light of the concerns disclosed. Tell your coach about any restrictions. This form does not diagnose a condition or replace medical advice. If your health changes, stop any affected activity and notify your coach before continuing. For urgent symptoms, seek medical assistance rather than waiting for a coaching reply.\n\nBy signing, I confirm that my answers are accurate to the best of my knowledge and that I will report relevant changes. My declaration does not replace the coach’s review of any required clearance." },
  informed: { version: "ebs-informed-consent-draft-2026-10-26-v1", title: "Informed Consent", approved: false,
    text: `Elite Body System — Informed Consent for Online Exercise

The activity
The system includes mobility, resistance and cardiovascular exercise, body-composition measurements and self-recorded assessments. Coaching and feedback are delivered remotely. Potential benefits include improved strength, fitness, movement and wellbeing. The program is not medical treatment, diagnosis or an emergency service.

Exercise risks
Risks include muscle soreness, strains, falls, joint injury, aggravation of an existing condition, dizziness and fainting. Rare serious events include cardiac complications, permanent injury or death. Appropriate instruction and modifications reduce risk but cannot remove it. Remote coaching cannot provide physical assistance or continuously monitor me or inspect my surroundings.

My choice and safety
I may ask questions, decline an activity, stop exercising or request an alternative. I will follow medical restrictions and use suitable space and equipment. I will stop for chest pain, fainting, unusual breathlessness, sudden severe pain or other concerning symptoms, and contact local emergency services when needed. I will not wait for an app or WhatsApp reply. A training challenge is not a reason to train through pain or ignore medical advice.

Emergency contact
I will provide an emergency contact who knows they are my contact. EBS may contact them where reasonably necessary for a suspected emergency. Recording their details does not mean EBS can detect an emergency, attend my location or arrange immediate treatment.

Health information
My screening answers, restrictions, measurements and private assessment media are used to assess readiness, tailor coaching and review progress, with access limited to authorised personnel and necessary service providers. The EBS privacy notice must explain its privacy contact, retention, recipients, rights and international transfers before consent is requested. I may request access or correction and withdraw consent to future consent-based processing. EBS will explain any effect on services that need that information. Publicity permission is separate.

By signing, I confirm that I understand the activity, its risks and alternatives, have had an opportunity to ask questions, and voluntarily consent to participate.` },
  participation: { version: "ebs-participation-draft-2026-10-26-v2", title: "Participation Agreement", approved: false,
    text: `Elite Body System — Fitness Participation Agreement

Online service
Elite Body System is a United States business delivering an online fitness system to clients worldwide. It provides the online training, general nutrition and habit education, and remote coaching included in the service purchased. It does not provide in-person supervision or replace a physician, physiotherapist, registered dietitian or mental-health professional. Do not change prescribed treatment based on the program.

Participation
I will provide accurate information, follow the agreed program within my capabilities and medical restrictions, and promptly raise concerns. I may stop or request an alternative to an unsuitable activity. I remain responsible for choosing a suitable training environment and equipment. EBS remains responsible for the duties the law places on it.

Service terms
The order and service terms supplied before purchase describe the price, billing schedule, included support, duration and cancellation process. This participation form does not add a minimum term, renewal, cancellation charge or refund exclusion. Any agreed guarantee must state its conditions and remedy clearly. Nothing here removes mandatory consumer or cancellation rights.

Inherent risks and legal rights
I understand the exercise risks set out in my separate Informed Consent. To the extent the applicable law permits, I accept the inherent risks of the activities I choose to undertake. This does not release liability for negligence, gross negligence, reckless or intentional misconduct, fraud, or any duty or liability that cannot lawfully be excluded. It does not waive access to a court or impose arbitration.

Content and publicity
I may post and share my own progress and content. EBS may use client content for promotion where authorised by its owner and permitted by applicable law. This form does not grant a marketing licence or prevent a separate media authorisation. Declining publicity does not affect coaching. Existing valid media permissions continue according to their terms and applicable law.

Electronic signing
I am at least 18 and have legal capacity to enter this agreement where I live. By confirming acceptance and typing my full name, I intend to sign this version electronically. I may download my signed record. EBS will provide an alternative way to sign on request through its service contact route. My participation signature is separate from my Informed Consent and health-information choice.` },
  coaching: { version: "ebs-coaching-commitment-draft-2026-10-26-v1", title: "Trainer–Client Agreement", approved: false,
    text: `Elite Body System — Our Coaching Commitment

My commitment to you — Harry Baldwin
I will build and adapt your training around your goals, starting point, ability, equipment and relevant restrictions. I will review your check-ins and training videos, explain useful changes and support you through the learning process. I will listen to concerns and adjust the approach when needed. You can contact me directly on WhatsApp. I will reply within 48 hours during Monday–Friday, 09:00–17:00 GMT; weekend messages are answered on Monday. New four-week programs are delivered before 06:00 GMT on the Monday the cycle begins. I will treat your personal information with care and respect your choices.

Your commitment to the process
Open and review your plan, complete the agreed training and habits, and record your progress honestly. Submit your weekly check-in by Sunday evening and share up to three useful exercise videos per workout for feedback. Ask questions and tell me promptly about pain, health changes, difficulties, missed sessions or anything you do not understand. Allow time to learn the system and practise new skills. Progress can involve effort and unfamiliarity; it never requires training through injury, hiding concerns or ignoring medical advice. If something is not working, we will address it together.

Four-week guarantee — draft proposal
Follow this agreement throughout your first four weeks and become stronger, leaner and more energised. The measurement criteria, review process and remedy must be confirmed before this guarantee can be offered or this agreement signed. No refund, claim deadline or additional charge is created by this draft.

Our agreement
We each commit to clear communication, honest feedback and the work agreed together. This commitment does not replace the Participation Agreement, Informed Consent, privacy choices or mandatory consumer rights. By accepting and typing my full name, I intend to sign the client commitment electronically. The coach’s commitment above is presented in Harry Baldwin’s name at his request; this draft is not an executed coach signature.` },
};

export function legalDocument(content: OnboardingContent, kind: DocumentKind): LegalDocument { return content.documents?.[kind] ?? DRAFT_DOCUMENTS[kind]; }
export function acknowledgement(answers: OnboardingAnswers, kind: DocumentKind): DocumentAcknowledgement { return kind === "participation" ? answers.consent : answers.documents?.[kind] ?? emptyDocumentAcknowledgements()[kind]; }
export function parseAcknowledgements(value: unknown): AdditionalAcknowledgements | undefined {
  if (!isRecord(value)) return undefined;
  const items = Object.fromEntries(["parq", "informed", "coaching"].map(key => [key, value[key]]));
  if (!Object.values(items).every(item => isRecord(item) && isText(item.version, 100) && isText(item.signedName, 100) && typeof item.accepted === "boolean")) return undefined;
  return Object.fromEntries(Object.entries(items).map(([key, item]) => { const d = item as Record<string, unknown>; return [key, { version: d.version as string, signedName: (d.signedName as string).trim(), accepted: d.accepted as boolean }]; })) as AdditionalAcknowledgements;
}
export function parseLegalDocuments(value: unknown): LegalDocuments | undefined {
  if (!isRecord(value)) return undefined;
  if (!DOCUMENT_KINDS.every(kind => { const d = value[kind]; return isRecord(d) && isText(d.version, 100) && !!d.version.trim() && isText(d.title, 100) && !!d.title.trim() && isText(d.text, 20000) && !!d.text.trim() && typeof d.approved === "boolean"; })) return undefined;
  return Object.fromEntries(DOCUMENT_KINDS.map(kind => { const d = value[kind] as Record<string, unknown>; return [kind, { version: d.version as string, title: d.title as string, text: d.text as string, approved: d.approved as boolean }]; })) as LegalDocuments;
}
export function documentProblem(input: Readonly<{ answers: OnboardingAnswers; content: OnboardingContent; kind: DocumentKind }>): string | null {
  const { answers: a, content: c, kind } = input, d = legalDocument(c, kind), signed = acknowledgement(a, kind);
  if (!d.approved) return "This document is a draft and is not open for signature.";
  if (signed.version !== d.version || !signed.accepted || !signed.signedName.trim()) return "Confirm acceptance and enter your full name to sign this document.";
  if (kind === "parq") return c.healthQuestions.length !== 7 ? "Configure the seven screening questions before signing." : healthScreeningProblem({ answers: a });
  if (kind === "informed") {
    if (!a.routine.emergencyName.trim() || a.routine.emergencyPhone.replace(/\D/g, "").length < 7) return "Enter your emergency contact’s name and phone number.";
    if (!a.consent.healthData) return "Confirm your health-information consent.";
  }
  if (kind === "participation" && !a.consent.adult) return "Confirm that you are at least 18 and legally able to agree.";
  return null;
}
export function documentFingerprint(input: Readonly<{ answers: OnboardingAnswers; content: OnboardingContent; kind: DocumentKind }>): string {
  const { answers: a, content: c, kind } = input;
  return JSON.stringify([kind, legalDocument(c, kind), acknowledgement(a, kind),
    kind === "parq" || kind === "informed" ? [c.parqVersion, c.healthQuestions, a.health, a.healthDetails, a.medicalClearance] : null,
    kind === "informed" ? [a.routine.emergencyName, a.routine.emergencyPhone, a.consent.healthData] : null,
    kind === "participation" ? a.consent.adult : null]);
}
export function parseDocumentDates(value: unknown): DocumentDates | undefined {
  if (!isRecord(value) || !DOCUMENT_KINDS.every(kind => value[kind] === null || typeof value[kind] === "string" && Number.isFinite(Date.parse(value[kind] as string)))) return undefined;
  return Object.fromEntries(DOCUMENT_KINDS.map(kind => [kind, value[kind]])) as DocumentDates;
}
