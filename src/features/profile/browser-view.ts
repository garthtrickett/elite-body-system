import { html, nothing } from "lit-html";
import { live } from "lit-html/directives/live.js";
import type { ProfileProposal, ProfileUiModel, ProfileField } from "./browser-model.ts";
import type { StoryField, Targets } from "./data.ts";
import { STORY_FIELDS } from "./data.ts";
import { SETUP_STEPS, STORY_QUESTIONS, HEALTH_QUESTIONS, DRAFT_CONSENT } from "./onboarding-content.ts";

export type ProfileUiActions = Readonly<{ propose: (proposal: ProfileProposal) => void; close: () => void }>;

function field(model: ProfileUiModel, actions: ProfileUiActions, key: ProfileField, label: string, value: string, options: Readonly<{ area?: boolean; type?: string }> = {}) {
  const change = (event: Event) => actions.propose({ kind: "fieldChanged", field: key, value: (event.target as HTMLInputElement).value });
  return html`<label class="sc-form-field"><span class="sc-label">${label}</span>${options.area
    ? html`<textarea class="sc-textarea" rows="3" maxlength="2000" .value=${live(value)} @input=${change}></textarea>`
    : html`<input class="sc-textarea" type=${options.type ?? "text"} maxlength="200" .value=${live(value)} @input=${change}>`}</label>`;
}

function setupContent(model: ProfileUiModel, actions: ProfileUiActions) {
  const d = model.draft, step = SETUP_STEPS[d.setupStep];
  if (step && step in STORY_QUESTIONS) {
    const key = step as StoryField, q = STORY_QUESTIONS[key];
    return html`<h3 class="sc-display text-3xl">${q.question}</h3>${"choices" in q
      ? html`<div class="flex flex-wrap gap-2">${q.choices.map(choice => {
        const selected = "multiple" in q ? d.story[key].split(", ").includes(choice) : d.story[key] === choice;
        return html`<button class="sc-choice ${selected ? "sc-choice-selected" : ""}" aria-pressed=${selected} @click=${() => {
          const values = d.story[key].split(", ").filter(Boolean);
          actions.propose({ kind: "storyChanged", field: key, value: "multiple" in q ? (selected ? values.filter(v => v !== choice) : [...values, choice]).join(", ") : choice });
        }}>${choice}</button>`;
      })}</div>`
      : html`<label class="sc-form-field"><span class="sr-only">${q.question}</span><textarea class="sc-textarea" rows="4" maxlength="2000" .value=${live(d.story[key])}
        @input=${(event: Event) => actions.propose({ kind: "storyChanged", field: key, value: (event.target as HTMLTextAreaElement).value })}></textarea></label>`}`;
  }
  switch (step) {
    case "welcome": return html`<h3 class="sc-display text-5xl">This is Day 1.</h3><p class="sc-copy">Not another fresh start. A system built so you never have to start again. Let’s set it up around your life.</p><p class="sc-copy text-xs">Your answers are saved to your account as you continue. You can leave and resume on another device.</p>`;
    case "next": return html`<h3 class="sc-display text-3xl">Good decision. Here’s what happens next.</h3><p class="sc-copy">Build your week. Tell Harry your story. Set your starting point and your daily rhythm.</p>`;
    case "name": return field(model, actions, "name", "What should Harry call you?", d.name);
    case "how": return html`<h3 class="sc-display text-3xl">One card. Three pillars. Every day.</h3><p class="sc-copy">Nutrition, activity and mindset. Track the truth, not perfect. The scorecard gives you one place to see it.</p>`;
    case "rhythm": return html`<h3 class="sc-display text-3xl">The rhythm for success.</h3><p class="sc-copy">Monday: your program. Throughout the week: form feedback. Saturday: your check-in. Your daily scorecard keeps the conversation grounded.</p>`;
    case "whatsapp": return html`<h3 class="sc-display text-3xl">Your coaching conversation.</h3><p class="sc-copy">Contact Harry through your agreed coaching channel. His WhatsApp link will appear here once it is configured.</p>`;
    case "week": return html`<h3 class="sc-display text-3xl">Pick your four training days.</h3><div class="flex flex-wrap gap-2">${[1, 2, 3, 4, 5, 6, 0].map(day => html`
      <button class="sc-choice ${d.trainingDays.includes(day) ? "sc-choice-selected" : ""}" aria-pressed=${d.trainingDays.includes(day)} @click=${() => actions.propose({ kind: "trainingDayToggled", day })}>${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]}</button>`)}</div>
      <label class="sc-form-field"><span class="sc-label">Rest day</span><select class="sc-textarea" .value=${String(d.restDay)} @change=${(event: Event) => actions.propose({ kind: "restDayChanged", day: Number((event.target as HTMLSelectElement).value) })}>
        ${[0, 1, 2, 3, 4, 5, 6].map(day => html`<option value=${day}>${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day]}</option>`)}</select></label><p class="sc-copy text-xs">The two remaining days become active recovery.</p>`;
    case "space": return html`${field(model, actions, "equipment", "Where will you train, and what equipment do you have?", d.equipment, { area: true })}${field(model, actions, "workaround", "Old injuries or niggles Harry should work around (optional)", d.workaround, { area: true })}`;
    case "anchor": return html`${field(model, actions, "anchor", "When will you fill in your scorecard?", d.anchor)}${field(model, actions, "timezone", "Your time zone (for example Europe/London)", d.timezone)}`;
    case "storyIntro": return html`<h3 class="sc-display text-3xl">Your story.</h3><p class="sc-copy">The more Harry knows, the better he can coach you. These are your words, not a test.</p>`;
    case "safetyIntro": return html`<h3 class="sc-display text-3xl">Before you train.</h3><p class="sc-copy">Answer honestly. A yes means you may need to check with your doctor before training.</p><p class="sc-copy">This screening is a draft awaiting the final wording.</p>`;
    case "parq": return html`<h3 class="sc-display text-3xl">Health check</h3><p class="sc-copy text-xs">Draft questions · not the final PAR-Q+ document.</p>${HEALTH_QUESTIONS.map((question, index) => html`
      <fieldset class="sc-panel-card"><legend class="sc-copy">${question}</legend><div class="mt-2 flex gap-2">${[false, true].map(yes => html`<button class="sc-choice ${d.health.answers[index] === yes ? "sc-choice-selected" : ""}" aria-pressed=${d.health.answers[index] === yes}
        @click=${() => actions.propose({ kind: "healthChanged", index, yes })}>${yes ? "Yes" : "No"}</button>`)}</div></fieldset>`)}`;
    case "parqMore": return html`${field(model, actions, "healthDetails", "Tell Harry about the condition, medication or injury", d.health.details, { area: true })}<p class="sc-copy">Training will stay on hold until you confirm that your doctor has cleared you.</p>`;
    case "emergency": return html`${field(model, actions, "emergencyName", "Emergency contact’s name", d.emergency.name)}${field(model, actions, "emergencyPhone", "Emergency contact’s phone (include country code)", d.emergency.phone, { type: "tel" })}`;
    case "consent": return html`<h3 class="sc-display text-3xl">Read, acknowledge and sign.</h3><p class="sc-copy font-medium">Draft wording — awaiting the approved consent document. Your acknowledgement is recorded against draft-v1.</p>
      ${DRAFT_CONSENT.map(([title, text]) => html`<section class="sc-panel-card"><h4 class="sc-label">${title}</h4><p class="sc-copy mt-2">${text}</p></section>`)}
      ${([ ["accepted", "I have read and acknowledge this draft"], ["healthData", "I agree to storing my health answers for coaching"], ["adult", "I am at least 18 years old"] ] as const).map(([key, label]) => html`<label class="flex items-start gap-3 text-sm"><input type="checkbox" .checked=${d.consent[key]} @change=${(event: Event) => actions.propose({ kind: "consentChanged", field: key, value: (event.target as HTMLInputElement).checked })}>${label}</label>`)}
      ${field(model, actions, "signedName", "Full name", d.consent.signedName)}`;
    case "scale": return field(model, actions, "startingWeight", "Starting body weight in kg", String(d.startingWeight ?? ""), { type: "number" });
    case "identity": return field(model, actions, "identity", "I’m becoming someone who…", d.identity, { area: true });
    case "win": return html`<h3 class="sc-display text-3xl">Your first win, right now.</h3><label class="sc-form-field"><span class="sc-label">Empty your head</span><textarea class="sc-textarea" rows="3" maxlength="5000" .value=${live(d.firstThought)} @input=${(event: Event) => actions.propose({ kind: "firstThoughtChanged", value: (event.target as HTMLTextAreaElement).value })}></textarea></label>
      <label class="sc-form-field"><span class="sc-label">One priority for 30 minutes of focus</span><input class="sc-textarea" maxlength="200" .value=${live(d.firstGoal)} @input=${(event: Event) => actions.propose({ kind: "firstGoalChanged", value: (event.target as HTMLInputElement).value })}></label>`;
    case "commit": return html`<h3 class="sc-display text-4xl">I’m becoming someone who ${d.identity}.</h3><p class="sc-copy">After ${d.anchor}, I fill in my scorecard. I track the truth, not perfect.</p><p class="sc-copy">— ${d.name}</p>`;
    case "done": return html`<h3 class="sc-display text-4xl">You’ve already started, ${d.name}.</h3><p class="sc-copy">Your profile and training week are saved. Your scorecard is ready.</p><button class="sc-primary" @click=${actions.close}>See my scorecard</button>`;
    default: return nothing;
  }
}

export function onboardingView(model: ProfileUiModel, actions: ProfileUiActions, busy: boolean) {
  const step = SETUP_STEPS[model.draft.setupStep];
  const sections = [ { label: "Your routine", start: 0, end: 12 }, { label: "Your story", start: 13, end: 23 }, { label: "Health & consent", start: 24, end: 28 }, { label: "Your starting point", start: 29, end: SETUP_STEPS.length - 1 } ] as const;
  const sectionIndex = sections.findIndex(section => model.draft.setupStep <= section.end);
  return html`<div class="sc-setup-progress"><div class="flex flex-wrap justify-between gap-2"><p class="sc-label">${sections[sectionIndex]?.label}</p><p class="sc-copy text-xs">Step ${model.draft.setupStep + 1} of ${SETUP_STEPS.length}</p></div>
    <progress class="sc-setup-progress-bar" aria-label="Setup progress" value=${model.draft.setupStep + 1} max=${SETUP_STEPS.length}></progress>
    <ol class="sc-setup-sections">${sections.map((section, index) => html`<li aria-current=${index === sectionIndex ? "step" : nothing}><span aria-hidden="true">${model.draft.setupStep > section.end ? "✓" : index + 1}.</span> ${section.label}</li>`)}</ol></div>
    <fieldset ?disabled=${busy} class="sc-setup-content flex flex-1 flex-col gap-4">${setupContent(model, actions)}
      ${model.error ? html`<p class="sc-error" role="alert">${model.error}</p>` : nothing}
      ${step !== "done" ? html`<div class="mt-auto flex flex-col gap-2 pt-4"><button class="sc-primary" @click=${() => actions.propose({ kind: step === "commit" ? "complete" : "next" })}>${busy ? "Saving…" : step === "commit" ? "Commit to my plan" : "Save and continue"}</button>
        <div class="flex justify-between"><button class="sc-secondary" ?disabled=${model.draft.setupStep === 0} @click=${() => actions.propose({ kind: "back" })}>Back</button><button class="sc-secondary" @click=${() => actions.propose({ kind: "save" })}>Save progress</button></div></div>` : nothing}
    </fieldset>`;
}

export function profileView(model: ProfileUiModel, actions: ProfileUiActions, busy: boolean) {
  const d = model.draft;
  const targetLabels: Readonly<Record<keyof Targets, string>> = { energy: "Energy (kcal)", protein: "Protein (g)", water: "Water (L)", sleep: "Sleep (h)", steps: "Steps" };
  return html`<h3 class="sc-display text-3xl">${d.name || "Your profile"}</h3><p class="sc-copy">${d.completed ? "Setup complete" : "Setup in progress"} · ${d.timezone}</p>
    <button class="sc-secondary" ?disabled=${busy} @click=${() => actions.propose({ kind: "editSetup" })}>${d.completed ? "Review setup" : "Resume setup"}</button>
    <div class="sc-profile-grid"><section class="sc-panel-card"><h3 class="sc-label">Daily targets</h3><p class="sc-copy my-2 text-xs">Adjust these to the targets agreed with your coach.</p><div class="grid grid-cols-2 gap-3">${(Object.keys(d.targets) as (keyof Targets)[]).map(key => html`
      <label class="sc-form-field"><span class="sc-label">${targetLabels[key]}</span><input class="sc-textarea" type="number" step=${key === "water" || key === "sleep" ? "0.1" : "1"} .value=${live(model.targetDrafts[key])} ?disabled=${busy}
        @input=${(event: Event) => actions.propose({ kind: "targetChanged", field: key, value: (event.target as HTMLInputElement).value })}></label>`)}</div>
      <button class="sc-primary mt-4 w-full" ?disabled=${busy} @click=${() => actions.propose({ kind: "save" })}>${busy ? "Saving…" : "Save targets"}</button></section>
    <section class="sc-panel-card"><h3 class="sc-label">Your plan</h3><dl class="sc-copy mt-3 space-y-3 text-sm">
      <div><dt class="sc-label">Training</dt><dd>${[1, 2, 3, 4, 5, 6, 0].filter(day => d.trainingDays.includes(day)).map(day => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(" · ") || "Not chosen"}</dd></div>
      <div><dt class="sc-label">Rest day</dt><dd>${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.restDay]}</dd></div>
      <div><dt class="sc-label">Training space and equipment</dt><dd class="whitespace-pre-wrap break-words">${d.equipment || "Not recorded"}</dd></div>
      ${d.workaround ? html`<div><dt class="sc-label">Work around</dt><dd class="whitespace-pre-wrap break-words">${d.workaround}</dd></div>` : nothing}
      <div><dt class="sc-label">Daily anchor</dt><dd class="break-words">${d.anchor || "Not chosen"}</dd></div>
      <div><dt class="sc-label">Identity</dt><dd class="whitespace-pre-wrap break-words">${d.identity || "Not written yet"}</dd></div>
      <div><dt class="sc-label">Emergency contact</dt><dd class="break-words">${d.emergency.name || "Not recorded"} ${d.emergency.phone}</dd></div>
    </dl></section>
    ${model.error ? html`<p class="sc-error" role="alert">${model.error}</p>` : nothing}
    <section class="sc-panel-card"><h3 class="sc-label">Health and consent</h3><p class="sc-copy mt-2">${d.health.answers.some(answer => answer === null) ? "Health screening incomplete" : d.health.answers.some(Boolean) ? d.health.clearance ? "Doctor clearance self-confirmed" : "Training on hold: clearance needed" : "No health concerns flagged"}</p>
      ${d.health.answers.some(Boolean) && !d.health.clearance ? html`<label class="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" @change=${(event: Event) => actions.propose({ kind: "clearanceChanged", value: (event.target as HTMLInputElement).checked })}>My doctor has cleared me to train</label><button class="sc-secondary mt-2" @click=${() => actions.propose({ kind: "save" })}>Save clearance confirmation</button>` : nothing}
      <p class="sc-copy mt-2 text-xs">${d.consent.accepted ? `Acknowledged draft-v1 as ${d.consent.signedName}` : "Draft consent not yet acknowledged"}</p></section>
    <section class="sc-panel-card"><h3 class="sc-label">Your story</h3><dl class="space-y-3 pt-3">${STORY_FIELDS.filter(key => d.story[key]).map(key => html`<div><dt class="sc-label">${STORY_QUESTIONS[key].question}</dt><dd class="sc-copy whitespace-pre-wrap break-words">${d.story[key]}</dd></div>`)}</dl></section></div>`;
}
