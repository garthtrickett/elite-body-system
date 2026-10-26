import { html } from "lit-html";
import { live } from "lit-html/directives/live.js";
import { MARKETING_MATERIALS, MARKETING_CHANNELS, MARKETING_IDENTITY } from "./marketing-data.ts";
import type { MarketingChoice, MarketingPermission } from "./marketing-data.ts";
import type { OnboardingModel, OnboardingProposal } from "./browser-model.ts";

export function marketingPermissionView(input: Readonly<{ model: OnboardingModel; busy: boolean; propose: (proposal: OnboardingProposal) => void }>) {
  const { model, propose } = input, snapshot = model.snapshot?.marketing;
  if (!snapshot) return html``;
  const draft = model.marketingDraft, record = snapshot.record;
  const edit = (permission: MarketingPermission) => propose({ kind: "editMarketing", permission });
  const choices = (labels: Readonly<Partial<Record<MarketingChoice, string>>>) => Object.entries(labels).map(([key, label]) => html`<label class="ob-check"><input type="checkbox" .checked=${draft.choices[key as MarketingChoice]} @change=${(event: Event) => edit({ ...draft, choices: { ...draft.choices, [key]: (event.target as HTMLInputElement).checked } })}><span>${label}</span></label>`);
  const active = record?.action === "granted";
  return html`<section class="sc-panel-card" aria-label="Optional marketing permission"><h2 class="sc-display text-3xl">Media & Testimonial Release</h2>
    <p class="sc-copy my-3">Optional. Saying no or withdrawing will not affect your fitness service or onboarding completion. Your private health-data consent does not give marketing permission.</p>
    <p class="sc-copy my-3" role="status">${active ? `Marketing permission saved on ${new Date(record.recordedAt).toLocaleString()} under ${record.release.version}.` : record?.action === "withdrawn" ? "Marketing permission withdrawn. No further marketing use is permitted." : "No marketing permission has been given."}</p>
    ${active ? html`<ul class="sc-copy ob-missing">${Object.entries({ ...MARKETING_MATERIALS, ...MARKETING_CHANNELS, ...MARKETING_IDENTITY }).filter(([key]) => record.permission.choices[key as MarketingChoice]).map(([, label]) => html`<li>${label}</li>`)}</ul>${record.permission.limitations ? html`<p class="sc-copy my-3">Saved restrictions: ${record.permission.limitations}</p>` : html``}<details class="my-3"><summary class="sc-secondary">View the release I agreed to</summary><p class="sc-copy whitespace-pre-wrap my-3">${record.release.text}</p><p class="sc-copy">Acknowledged by ${record.permission.signedName}.</p></details>` : html``}
    <details class="my-3"><summary class="sc-secondary">Read the optional marketing release</summary><p class="sc-copy whitespace-pre-wrap my-3">${snapshot.release.text}</p></details>
    <p class="sc-copy text-xs my-3">Document: ${snapshot.release.version}</p>
    ${!snapshot.release.approved ? html`<p class="sc-copy my-3">Draft for review. New marketing permission cannot be given yet. Existing permission can always be withdrawn.</p>` : html``}
    ${active && record.release.version !== snapshot.release.version ? html`<p class="sc-copy my-3">Your saved permission remains limited to the earlier release above. Saving new choices requires agreement to the current release.</p>` : html``}
    <fieldset class="ob-fields" ?disabled=${input.busy || model.reloadRequired || !snapshot.release.approved}><legend class="sc-label">Choose what EBS may use</legend>
      ${choices(MARKETING_MATERIALS)}<fieldset class="ob-fields"><legend class="sc-label">Where it may appear</legend>${choices(MARKETING_CHANNELS)}</fieldset>
      <fieldset class="ob-fields"><legend class="sc-label">How I may be identified</legend><p class="sc-copy">Leave both unticked for use without your name or recognisable features.</p>${choices(MARKETING_IDENTITY)}</fieldset>
      <label class="sc-form-field"><span class="sc-label">Specific materials or restrictions (optional)</span><textarea class="sc-textarea" rows="3" maxlength="2000" .value=${live(draft.limitations)} @input=${(event: Event) => edit({ ...draft, limitations: (event.target as HTMLTextAreaElement).value })}></textarea></label>
      <label class="ob-check"><input type="checkbox" .checked=${draft.accepted} @change=${(event: Event) => edit({ ...draft, version: snapshot.release.version, accepted: (event.target as HTMLInputElement).checked })}><span>I expressly give the optional marketing permissions I selected under this release.</span></label>
      <label class="ob-check"><input type="checkbox" .checked=${draft.adult} @change=${(event: Event) => edit({ ...draft, adult: (event.target as HTMLInputElement).checked })}><span>I am at least 18 and legally able to give this marketing permission.</span></label>
      <label class="sc-form-field"><span class="sc-label">Full name for marketing permission</span><input class="sc-textarea" maxlength="100" .value=${live(draft.signedName)} @input=${(event: Event) => edit({ ...draft, signedName: (event.target as HTMLInputElement).value })}></label>
      <button class="sc-secondary" ?disabled=${!!model.pending || !model.marketingDirty} @click=${() => propose({ kind: "saveMarketing" })}>Save marketing choices</button>
    </fieldset>
    <div class="flex flex-wrap gap-2 mt-3">${active ? html`<button class="sc-secondary" ?disabled=${input.busy || model.reloadRequired} @click=${() => propose({ kind: "withdrawMarketing" })}>Withdraw all marketing permission</button>` : html``}${model.marketingDirty ? html`<button class="sc-secondary" ?disabled=${input.busy} @click=${() => propose({ kind: "discardMarketing" })}>Discard marketing changes</button>` : html``}</div>
    <p class="sc-copy text-xs mt-3">Return to Onboarding → Health & Safety Agreement any time to review or withdraw permission. For questions or removal requests, use Contact Harry in this section.</p>
  </section>`;
}
