import { html, nothing } from "lit-html";
import { live } from "lit-html/directives/live.js";
import type { OnboardingAnswers } from "./data.ts";
import type { OnboardingModel, OnboardingProposal } from "./browser-model.ts";
import type { DocumentKind, DocumentAcknowledgement } from "./documents.ts";
import { acknowledgement, documentFingerprint, documentProblem, emptyDocumentAcknowledgements, legalDocument } from "./documents.ts";
import { DRAFT_HEALTH_SAFETY } from "./health-safety.ts";

type Input = Readonly<{ model: OnboardingModel; kind: DocumentKind; propose: (proposal: OnboardingProposal) => void }>;
export function documentForm({ model, kind, propose }: Input) {
  const snapshot = model.snapshot;
  if (!snapshot) return nothing;
  const a = model.draft, document = legalDocument(snapshot.content, kind), signed = acknowledgement(a, kind);
  const busy = !!model.pending || model.accountBusy || model.reloadRequired || !!snapshot.completedAt;
  const recorded = snapshot.documentSignedAt?.[kind] && documentFingerprint({ answers: a, content: snapshot.content, kind }) === documentFingerprint({ answers: snapshot.answers, content: snapshot.content, kind }) ? snapshot.documentSignedAt[kind] : null;
  const edit = (answers: OnboardingAnswers) => propose({ kind: "edit", answers });
  const withSignature = (answers: OnboardingAnswers, changes: Partial<DocumentAcknowledgement>): OnboardingAnswers => kind === "participation"
    ? { ...answers, consent: { ...answers.consent, ...changes } }
    : { ...answers, documents: { ...emptyDocumentAcknowledgements(), ...answers.documents, [kind]: { ...acknowledgement(answers, kind), ...changes } } };
  const field = (label: string, value: string, change: (value: string) => void, signature = false) => html`<label class="ob-doc-field"><span>${label}</span><input class=${signature ? "ob-doc-signature" : ""} type="text" maxlength=${label.includes("phone") ? 50 : 100} .value=${live(value)} @input=${(event: Event) => change((event.target as HTMLInputElement).value)}></label>`;
  const check = (label: string, checked: boolean, change: (value: boolean) => void, disabled = false) => html`<label class="ob-doc-check"><input type="checkbox" ?disabled=${disabled} .checked=${checked} @change=${(event: Event) => change((event.target as HTMLInputElement).checked)}><span>${label}</span></label>`;
  const reset = (answers: OnboardingAnswers, keys: readonly ("parq" | "informed")[]) => ({ ...answers, documents: Object.fromEntries(Object.entries({ ...emptyDocumentAcknowledgements(), ...answers.documents }).map(([key, value]) => [key, keys.includes(key as "parq" | "informed") ? { ...value, accepted: false } : value])) as NonNullable<OnboardingAnswers["documents"]> });
  const signingProblem = documentProblem({ answers: a, content: snapshot.content, kind });
  return html`<details class="ob-document" ?open=${kind === "parq" || kind === "coaching"}>
    <summary><span class="ob-doc-number" aria-hidden="true">${recorded ? "✓" : kind === "parq" ? "01" : kind === "informed" ? "02" : kind === "participation" ? "03" : "↔"}</span><span>${document.title}</span><span class="ob-doc-status">${recorded ? "Signed" : !document.approved ? "Draft" : "Review & sign"}</span><span class="ob-doc-chevron" aria-hidden="true">⌄</span></summary>
    <div class="ob-doc-paper"><header><p>ELITE BODY SYSTEM</p><h2>${document.title}</h2><p class="ob-doc-version">${document.version}${!document.approved ? " · Draft for legal review" : ""}</p></header>
      <div class="ob-doc-copy">${document.text}</div>
      <form aria-label=${document.title} @submit=${(event: SubmitEvent) => { event.preventDefault(); if (!busy && !signingProblem) propose({ kind: "save" }); }}><fieldset ?disabled=${busy}>
      ${kind === "parq" ? html`<div class="ob-doc-questions">${(snapshot.content.healthQuestions.length ? snapshot.content.healthQuestions : DRAFT_HEALTH_SAFETY.healthQuestions).map((question, index) => html`<fieldset><legend>${index + 1}. ${question}</legend><div class="ob-doc-answers">${[false, true].map(yes => html`<label><input type="radio" name=${`readiness-${index}`} .checked=${a.health[index] === yes} @change=${() => edit(reset({ ...a, health: a.health.map((answer, i) => i === index ? yes : answer), medicalClearance: false }, ["parq", "informed"]))}><span>${yes ? "Yes" : "No"}</span></label>`)}</div></fieldset>`)}</div>
        ${a.health.some(Boolean) ? html`<label class="ob-doc-field"><span>Briefly explain your Yes answers in a short sentence</span><textarea rows="3" maxlength="2000" .value=${live(a.healthDetails)} @input=${(event: Event) => edit(reset({ ...a, healthDetails: (event.target as HTMLTextAreaElement).value, medicalClearance: false }, ["parq", "informed"]))}></textarea></label>
          ${check("A registered physician has medically cleared me for physical activity in light of the concerns I have disclosed.", a.medicalClearance, value => edit(reset({ ...a, medicalClearance: value }, ["parq", "informed"])) )}` : nothing}` : nothing}
      ${kind === "informed" ? html`<section class="ob-doc-contact"><h3>Emergency contact</h3>
        ${field("Emergency contact’s name", a.routine.emergencyName, value => edit(reset({ ...a, routine: { ...a.routine, emergencyName: value } }, ["informed"])))}
        ${field("Emergency contact’s phone (include country code)", a.routine.emergencyPhone, value => edit(reset({ ...a, routine: { ...a.routine, emergencyPhone: value } }, ["informed"])))}
        ${check("I explicitly consent to EBS using my health answers, measurements and private assessment media for readiness screening, personalised coaching and progress review as described in this form and the privacy notice.", a.consent.healthData, value => edit(reset({ ...a, consent: { ...a.consent, healthData: value } }, ["informed"])))}
      </section>` : nothing}
      ${kind === "participation" ? check("I am at least 18 and legally able to enter this agreement where I live.", a.consent.adult, value => edit({ ...a, consent: { ...a.consent, adult: value, accepted: false } })) : nothing}
      ${kind === "coaching" ? html`<div class="ob-doc-coach"><span>Coach commitment</span><strong>Harry Baldwin</strong><span>Elite Body System</span></div>` : nothing}
      <div class="ob-doc-signing">
        ${field(`Full name — ${kind === "parq" ? "PAR-Q" : kind === "informed" ? "Informed Consent" : kind === "participation" ? "Participation Agreement" : "Trainer–Client Agreement"} signature`, signed.signedName, value => edit(withSignature(a, { signedName: value, accepted: false })), true)}
        ${check(kind === "parq" ? "My answers are accurate to the best of my knowledge. I have read this form and intend my typed name to be my electronic signature." : `I have read the ${document.title}, accept it and intend my typed name to be my electronic signature.`, signed.accepted && signed.version === document.version, checked => edit(withSignature(a, { version: document.version, accepted: checked })), !document.approved)}
        ${recorded ? html`<p class="ob-doc-recorded">✓ Signed and saved · ${new Date(recorded).toLocaleString()}</p><a class="ob-doc-download" href=${`/api/client/onboarding/document?kind=${kind}`} download>Download signed copy</a>` : html`<button class="ob-doc-submit" type="submit" ?disabled=${busy || !!signingProblem}>Sign and save</button>`}
        ${!document.approved ? html`<p class="ob-doc-note">You can save your answers as a draft. Signing is available after the document is approved.</p>` : nothing}
      </div></fieldset></form>
    </div></details>`;
}
