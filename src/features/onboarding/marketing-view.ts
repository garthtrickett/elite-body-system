import { html, nothing } from "lit-html";
import { live } from "lit-html/directives/live.js";
import { workspace } from "../../shared/browser-layout.ts";
import { MARKETING_CHANNELS, MARKETING_IDENTITY } from "./marketing-data.ts";
import type { MarketingChoice, MarketingPermission } from "./marketing-data.ts";
import type { OnboardingModel, OnboardingProposal } from "./browser-model.ts";
import { storyMaterials } from "./story-data.ts";

export function marketingPermissionView(input: Readonly<{ model: OnboardingModel; busy: boolean; propose: (proposal: OnboardingProposal) => void }>) {
  const { model, propose } = input, snapshot = model.snapshot?.marketing;
  if (!snapshot) return html`<p class="sc-copy" role="status">Loading your media preferences…</p>`;
  const draft = model.marketingDraft, story = snapshot.story, active = snapshot.active ?? (snapshot.record?.action === "granted" ? [snapshot.record] : []);
  const name = draft.signedName || story?.clientName || "";
  const edit = (permission: MarketingPermission) => propose({ kind: "editMarketing", permission: { ...permission, signedName: permission.signedName || name, adult: permission.accepted, ...(story ? { storyId: story.id, choices: { ...permission.choices, ...storyMaterials({ story }) } } : {}) } });
  const choices = (labels: Readonly<Partial<Record<MarketingChoice, string>>>) => Object.entries(labels).map(([key, label]) => html`<label class="ob-check"><input type="checkbox" .checked=${draft.choices[key as MarketingChoice]} @change=${(event: Event) => edit({ ...draft, accepted: false, choices: { ...draft.choices, [key]: (event.target as HTMLInputElement).checked } })}><span>${label}</span></label>`);
  return html`<section class="sc-panel-card" aria-label="Optional marketing permission">
    <p class="sc-copy my-3">Sharing a story is optional and does not affect your coaching. Your private assessments are not automatically available for marketing.</p>
    ${active.length ? html`<details class="my-3"><summary class="sc-secondary">Review my saved permissions (${active.length})</summary>${active.map(record => html`<section class="my-3"><h2 class="sc-label">${record.story?.title ?? "Earlier media permission"}</h2>${record.story ? html`<p class="sc-copy whitespace-pre-wrap">${record.story.results}</p><p class="sc-copy whitespace-pre-wrap">${record.story.testimonial}</p>` : nothing}<ul class="sc-copy ob-missing">${Object.entries({ ...MARKETING_CHANNELS, ...MARKETING_IDENTITY }).filter(([key]) => record.permission.choices[key as MarketingChoice]).map(([, label]) => html`<li>${label}</li>`)}</ul><p class="sc-copy">Restrictions: ${record.permission.limitations || "None added"}</p><details><summary class="sc-secondary">View signed release</summary><p class="sc-copy whitespace-pre-wrap">${record.release.text}</p><p class="sc-copy">${record.permission.signedName} · ${new Date(record.recordedAt).toLocaleString()} · ${record.release.version}</p></details></section>`)}</details><button class="sc-secondary my-3" ?disabled=${input.busy || model.reloadRequired} @click=${() => propose({ kind: "withdrawMarketing" })}>Withdraw all marketing permission</button>` : html`<p class="sc-copy my-3" role="status">${snapshot.record?.action === "withdrawn" ? "Marketing permission withdrawn. No further marketing use is permitted." : "No marketing permission has been given."}</p>`}
    ${story ? html`<section aria-label="Story to approve"><h2 class="sc-display text-3xl my-3">${story.title}</h2><p class="sc-copy">Harry has selected this milestone for you to review. Approve only if you are happy with the exact content below.</p>
      ${story.results ? html`<h3 class="sc-label mt-3">Results</h3><p class="sc-copy whitespace-pre-wrap my-3">${story.results}</p>` : nothing}
      ${story.testimonial ? html`<h3 class="sc-label mt-3">Your testimonial</h3><p class="sc-copy whitespace-pre-wrap my-3">${story.testimonial}</p>` : nothing}
      ${story.mediaIds.map((id, index) => html`<button class="sc-secondary my-2" ?disabled=${input.busy} @click=${() => propose({ kind: "read", mediaId: id })}>Review photo or video ${index + 1}</button>`)}
      <details class="my-3"><summary class="sc-secondary">Read the optional media release</summary><p class="sc-copy whitespace-pre-wrap my-3">${snapshot.release.text}</p><p class="sc-copy text-xs">${snapshot.release.version}</p></details>
      ${!snapshot.release.approved ? html`<p class="sc-copy">The release is being finalised. You can review or withdraw existing permission any time.</p>` : nothing}
      <fieldset class="ob-fields" ?disabled=${input.busy || model.reloadRequired || !snapshot.release.approved}><legend class="sc-label">Where may EBS share this story?</legend>${choices(MARKETING_CHANNELS)}
        <details class="my-3"><summary class="sc-secondary">Name, face and other preferences</summary><p class="sc-copy my-3">Without permission, EBS must omit your name and obscure your face and other identifying features.</p>${choices(MARKETING_IDENTITY)}
          <label class="sc-form-field"><span class="sc-label">Restrictions (optional)</span><textarea class="sc-textarea" maxlength="2000" rows="2" .value=${live(draft.limitations)} @input=${(event: Event) => edit({ ...draft, accepted: false, limitations: (event.target as HTMLTextAreaElement).value })}></textarea></label>
          <label class="sc-form-field"><span class="sc-label">Full name for marketing permission</span><input class="sc-textarea" maxlength="100" .value=${live(name)} @input=${(event: Event) => edit({ ...draft, accepted: false, signedName: (event.target as HTMLInputElement).value })}></label>
        </details>
        <label class="ob-check"><input type="checkbox" .checked=${draft.accepted} @change=${(event: Event) => edit({ ...draft, version: snapshot.release.version, accepted: (event.target as HTMLInputElement).checked })}><span>I expressly approve this story for my selected channels under the release, and electronically sign as ${name || "the name entered above"}. I am 18 or older and legally able to give this permission.</span></label>
        <div class="flex flex-wrap gap-2"><button class="sc-primary" ?disabled=${!!model.pending || !model.marketingDirty} @click=${() => propose({ kind: "saveMarketing" })}>Approve this story</button><a class="sc-secondary ob-link" href="/">Not now</a></div>
      </fieldset></section>` : html`<p class="sc-copy my-3">When you have a milestone to celebrate, Harry can invite you to review a specific story here. There is nothing to approve now.</p>`}
    ${model.marketingDirty ? html`<button class="sc-secondary mt-3" ?disabled=${input.busy} @click=${() => propose({ kind: "discardMarketing" })}>Discard marketing changes</button>` : nothing}
    <p class="sc-copy text-xs mt-3">Return to Media preferences in your account to review or withdraw permission. For questions or removal requests, use your usual EBS contact route.</p>
  </section>`;
}
export function marketingPage(input: Readonly<{ model: OnboardingModel; busy: boolean; propose: (proposal: OnboardingProposal) => void }>) {
  return workspace({ content: html`<main class="sc-page"><a class="sc-secondary ob-link" href="/">Back to scorecard</a><h1 class="sc-display text-4xl my-4">Media preferences</h1>${marketingPermissionView(input)}<div class="ob-feedback" tabindex="-1">${input.model.error ? html`<p class="sc-error" role="alert">${input.model.error}</p>` : nothing}${input.model.message ? html`<p class="sc-copy" role="status">${input.model.message}</p>` : nothing}${input.model.reloadRequired ? html`<button class="sc-secondary" @click=${() => input.propose({ kind: "reload" })}>Reload saved progress</button>` : nothing}</div></main>` });
}
