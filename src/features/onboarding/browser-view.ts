import { html, nothing } from "lit-html";
import { live } from "lit-html/directives/live.js";
import { repeat } from "lit-html/directives/repeat.js";
import { SECTIONS, SECTION_LABELS, QUESTIONS, GOAL_LABELS, MEASUREMENTS, LIFESTYLE, mediaSlots, assessmentSubmissionProblem, validTimezone, measurementProblem } from "./data.ts";
import type { OnboardingAnswers, Section, Question, Measurement, Lifestyle, Goal } from "./data.ts";
import type { OnboardingModel, OnboardingProposal } from "./browser-model.ts";
import { representOnboarding } from "./browser-model.ts";
import { COACHING_COMMUNICATION } from "./coaching-content.ts";
import { weeklyRhythmView } from "./rhythm-view.ts";
import { documentForm } from "./document-view.ts";

type State = ReturnType<typeof representOnboarding>;
type Actions = Readonly<{ propose: (proposal: OnboardingProposal) => void; upload: (input: Readonly<{ slot: string; file: File | undefined }>) => void; signOut: () => void; rankStart: (event: PointerEvent, goal: Goal) => void; rankMove: (event: PointerEvent) => void; rankEnd: (event: PointerEvent) => void; drag: (goal: Goal) => void; drop: (goal: Goal) => void }>;
const START_POINT_QUESTIONS: readonly Question[] = ["transformation", "now", "motivation", "struggles"];
const OTHER_QUESTIONS: readonly Question[] = ["choice", "finalThought", "experience", "success", "belief"];
function edit(state: OnboardingModel, actions: Actions, answers: OnboardingAnswers) { actions.propose({ kind: "edit", answers }); }
function textField(input: Readonly<{ label: string; value: string; change: (value: string) => void; area?: boolean; numeric?: boolean; max?: number; invalid?: boolean; error?: string }>) {
  const errorId = `onboarding-error-${input.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return html`<label class="sc-form-field"><span class="sc-label">${input.label}</span>${input.area
    ? html`<textarea class="sc-textarea" rows="4" maxlength=${input.max ?? 2000} aria-invalid=${!!input.invalid} .value=${live(input.value)} @input=${(event: Event) => input.change((event.target as HTMLTextAreaElement).value)}></textarea>`
    : html`<input class="sc-textarea" type="text" inputmode=${input.numeric ? "decimal" : "text"} maxlength=${input.max ?? 100} aria-invalid=${!!input.invalid || !!input.error} aria-describedby=${input.error ? errorId : nothing} .value=${live(input.value)} @input=${(event: Event) => input.change((event.target as HTMLInputElement).value)}>`}${input.error ? html`<span class="sc-field-error" id=${errorId}>${input.error}</span>` : nothing}</label>`;
}
function video(url: string, label: string) {
  return html`<video class="ob-video" controls preload="metadata" aria-label=${label} src=${url || nothing}></video>`;
}
function checkbox(label: string, checked: boolean, change: (checked: boolean) => void) {
  return html`<label class="ob-check"><input type="checkbox" .checked=${checked} @change=${(event: Event) => change((event.target as HTMLInputElement).checked)}><span>${label}</span></label>`;
}
function acknowledgements(state: State, actions: Actions, section: "welcome" | "communication" | "rhythm") {
  return checkbox("I’ve watched or read this guidance and understand what to do.", state.draft.acknowledged[section], checked => edit(state, actions, { ...state.draft, acknowledged: { ...state.draft.acknowledged, [section]: checked } }));
}
function moveGoal(state: State, actions: Actions, goal: Goal, delta: number) {
  const goals = [...state.draft.goals], index = goals.indexOf(goal), next = index + delta;
  if (next < 0 || next >= goals.length) return;
  goals.splice(index, 1); goals.splice(next, 0, goal);
  edit(state, actions, { ...state.draft, goals, goalsConfirmed: false });
}
function uploadSlots(state: State, actions: Actions, section: "audit" | "measurements") {
  const snapshot = state.snapshot!;
  return html`${mediaSlots(snapshot.content).filter(slot => slot.id.startsWith("photo:") === (section === "measurements")).map(slot => {
    const items = snapshot.media.filter(item => item.slot === slot.id);
    const resolved = hasResolution({ ...snapshot, requirement: slot.id });
    return html`<section class="sc-panel-card ob-upload-slot"><h3 class="sc-label">${slot.label}</h3>
      ${resolved ? html`<p class="sc-copy">Harry has recorded an approved alternative for this assessment.</p>` : nothing}
      ${items.map(item => html`<div class="ob-file"><p class="sc-copy">${item.status === "ready" ? "Submitted" : "Unfinished upload — choose the file again to retry"} · ${(item.size / 1024 / 1024).toFixed(1)} MiB</p><div class="flex flex-wrap gap-2">${item.status === "ready" ? html`<button class="sc-secondary" @click=${() => actions.propose({ kind: "read", mediaId: item.id })}>Download ${slot.label.toLowerCase()}</button>` : nothing}<button class="sc-secondary" @click=${() => actions.propose({ kind: "remove", mediaId: item.id })}>Remove ${slot.label.toLowerCase()}</button></div></div>`)}
      ${!snapshot.completedAt ? html`<label class="sc-upload"><span class="sc-upload-action">${items.some(item => item.status === "ready") ? "Replace" : "Upload"} ${slot.label.toLowerCase()}</span><span class="sc-copy text-xs">${slot.kind === "video" ? "MP4, MOV or WebM · up to 250 MiB" : "JPEG, PNG or WebP · up to 12 MiB"}</span><input class="sc-upload-input" type="file" accept=${slot.kind === "video" ? "video/mp4,video/quicktime,video/webm" : "image/jpeg,image/png,image/webp"} aria-label=${`Upload ${slot.label.toLowerCase()}`} @change=${(event: Event) => { const input = event.target as HTMLInputElement; actions.upload({ slot: slot.id, file: input.files?.[0] }); input.value = ""; }}></label>` : nothing}
    </section>`;
  })}`;
}
function physicalAssessments(state: State, actions: Actions) {
  const d = state.draft, c = state.snapshot!.content;
  const allowed = assessmentSubmissionProblem({ ...state.snapshot!, slot: "strength:pushups" }) === null && assessmentSubmissionProblem({ ...state.snapshot!, answers: d, slot: "strength:pushups" }) === null && JSON.stringify([d.health, d.healthDetails, d.medicalClearance, d.consent, d.documents, d.routine.emergencyName, d.routine.emergencyPhone]) === JSON.stringify([state.snapshot!.answers.health, state.snapshot!.answers.healthDetails, state.snapshot!.answers.medicalClearance, state.snapshot!.answers.consent, state.snapshot!.answers.documents, state.snapshot!.answers.routine.emergencyName, state.snapshot!.answers.routine.emergencyPhone]);
  return allowed ? html`<h2 class="sc-display text-3xl">Mobility</h2>${c.mobility.map(test => html`<section><h3 class="sc-label">${test.label}</h3><p class="sc-copy whitespace-pre-wrap my-3">${test.instructions}</p>${video(test.videoUrl, `${test.label} demonstration`)}</section>`)}
          <h2 class="sc-display text-3xl">Strength</h2>${video(c.strengthVideo, "Strength assessment guidance")}<p class="sc-copy">Submit separate videos for push-ups, pull-ups and squats.</p>
          <h2 class="sc-display text-3xl">Cardio</h2>${video(c.cardioVideo, "Cardio assessment guidance")}<p class="sc-copy whitespace-pre-wrap">${c.cardioInstructions}</p>
          <label class="sc-form-field"><span class="sc-label">Cardio modality</span><select class="sc-textarea" .value=${d.cardio} @change=${(event: Event) => edit(state, actions, { ...d, cardio: (event.target as HTMLSelectElement).value as OnboardingAnswers["cardio"] })}><option value="run">Run</option><option value="cross-trainer">Cross trainer — if running is not possible</option><option value="bike">Bike — if the cross trainer is not possible</option></select></label>
          ${uploadSlots(state, actions, "audit")}` : html`<p class="sc-panel-card sc-copy">Assessment instructions and submissions become available after consent and health screening are saved and any health concerns have been resolved with Harry.</p>`;
}
function sectionContent(state: State, actions: Actions) {
  const d = state.draft, c = state.snapshot!.content;
  const routine = (key: "name" | "timezone" | "weight" | "equipment" | "emergencyName" | "emergencyPhone", label: string, area = false, numeric = false) => textField({ label, value: d.routine[key], area, numeric, max: area ? 2000 : numeric ? 12 : key === "emergencyPhone" ? 50 : 100, invalid: key === "timezone" && !validTimezone(d.routine.timezone), change: value => edit(state, actions, { ...d, routine: { ...d.routine, [key]: value } }) });
  switch (state.section) {
    case "welcome": return html`<p class="sc-copy">Welcome to Elite Body System. Work through the onboarding to establish your starting point. Complete each section in full so we can understand your goals and tailor the system to you.</p>${video(c.welcomeVideo, "Welcome video")}`;
    case "questionnaire": return html`<p class="sc-copy">Let’s get you in the best shape of your life over the next 180 days. Provide as much information as possible and answer these questions with full integrity.</p>
      ${START_POINT_QUESTIONS.map(key => questionField(key))}
      <section class="sc-panel-card"><h2 class="sc-label">Rank your fitness goals in priority order</h2><p class="sc-copy my-3">Most important first. Drag a handle, or use Move up and Move down.</p>
        <ol class="ob-ranking">${repeat(d.goals, goal => goal, (goal, index) => html`<li class="ob-rank-row" data-goal=${goal} @dragover=${(event: DragEvent) => event.preventDefault()} @drop=${(event: DragEvent) => { event.preventDefault(); actions.drop(goal); }}>
          <button class="ob-rank-handle sc-secondary" aria-label=${`Reorder ${GOAL_LABELS[goal]} with arrow keys or drag`} draggable="true" @keydown=${(event: KeyboardEvent) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); moveGoal(state, actions, goal, event.key === "ArrowUp" ? -1 : 1); } }} @dragstart=${() => actions.drag(goal)} @pointerdown=${(event: PointerEvent) => actions.rankStart(event, goal)} @pointermove=${actions.rankMove} @pointerup=${actions.rankEnd} @pointercancel=${actions.rankEnd}>⠿</button><span class="ob-rank-name">${index + 1}. ${GOAL_LABELS[goal]}</span>
          <div class="ob-rank-controls"><button class="sc-secondary" aria-label=${`Move ${GOAL_LABELS[goal]} up`} ?disabled=${index === 0} @click=${() => moveGoal(state, actions, goal, -1)}>↑</button><button class="sc-secondary" aria-label=${`Move ${GOAL_LABELS[goal]} down`} ?disabled=${index === d.goals.length - 1} @click=${() => moveGoal(state, actions, goal, 1)}>↓</button></div></li>`)}</ol>
        ${checkbox("This is my preferred goal order.", d.goalsConfirmed, checked => edit(state, actions, { ...d, goalsConfirmed: checked }))}</section>
      ${OTHER_QUESTIONS.map(key => questionField(key))}`;
    case "audit": return state.snapshot!.completedAt && !c.documents ? html`<details class="ob-document" open><summary>Previously signed Participation Agreement</summary><div class="ob-doc-paper"><div class="ob-doc-copy">${c.consentText}</div><p class="ob-doc-recorded">${d.consent.signedName} · ${c.consentVersion}${state.snapshot!.consentSignedAt ? ` · ${new Date(state.snapshot!.consentSignedAt).toLocaleString()}` : ""}</p></div></details>` : html`<p class="sc-copy">Complete and sign these three forms before starting your physical assessments.</p>${(["parq", "informed", "participation"] as const).map(kind => documentForm({ model: state, kind, propose: actions.propose }))}`;
    case "communication": return html`<p class="sc-copy whitespace-pre-wrap">${c.communication || COACHING_COMMUNICATION}</p>${contact(c.contactUrl)}${acknowledgements(state, actions, "communication")}`;
    case "measurements": return html`${video(c.measurementVideo, "How to take your measurements")}<p class="sc-copy whitespace-pre-wrap">${c.measurementInstructions || "Take limb measurements at the thickest point on each side."}</p>
      <div class="ob-measurements">${(Object.keys(MEASUREMENTS) as Measurement[]).map(key => textField({ label: `${MEASUREMENTS[key]} (cm)`, value: d.measurements[key], numeric: true, max: 12, error: state.showMissing ? measurementProblem({ field: key, value: d.measurements[key] }) : "", change: value => edit(state, actions, { ...d, measurements: { ...d.measurements, [key]: value } }) }))}</div>
      ${routine("weight", "Starting body weight (kg)", false, true)}<h2 class="sc-display text-3xl">Your starting photos</h2><p class="sc-copy">Front, back and side. Save your consent to storing health information in Fitness Participation Agreement before uploading.</p>${uploadSlots(state, actions, "measurements")}${physicalAssessments(state, actions)}`;
    case "lifestyle": return html`${(Object.keys(LIFESTYLE) as Lifestyle[]).map(key => textField({ label: LIFESTYLE[key], value: d.lifestyle[key], area: true, invalid: state.showMissing && !d.lifestyle[key].trim(), change: value => edit(state, actions, { ...d, lifestyle: { ...d.lifestyle, [key]: value } }) }))}
      ${routine("equipment", "Where will you train, and what equipment do you have?", true)}<fieldset><legend class="sc-label">Your four training days</legend><div class="flex flex-wrap gap-2 mt-3">${[1, 2, 3, 4, 5, 6, 0].map(day => html`<button class="sc-choice ${d.routine.trainingDays.includes(day) ? "sc-choice-selected" : ""}" aria-pressed=${d.routine.trainingDays.includes(day)} @click=${() => edit(state, actions, { ...d, routine: { ...d.routine, trainingDays: d.routine.trainingDays.includes(day) ? d.routine.trainingDays.filter(value => value !== day) : d.routine.trainingDays.length < 4 ? [...d.routine.trainingDays, day] : d.routine.trainingDays } })}>${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]}</button>`)}</div></fieldset>
      <label class="sc-form-field"><span class="sc-label">Rest day</span><select class="sc-textarea" .value=${String(d.routine.restDay)} @change=${(event: Event) => edit(state, actions, { ...d, routine: { ...d.routine, restDay: Number((event.target as HTMLSelectElement).value) } })}>${[0, 1, 2, 3, 4, 5, 6].map(day => html`<option value=${day}>${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day]}</option>`)}</select></label>`;
    case "rhythm": return html`${weeklyRhythmView()}${contact(c.contactUrl)}${documentForm({ model: state, kind: "coaching", propose: actions.propose })}${acknowledgements(state, actions, "rhythm")}`;
    case "call": {
      const booking = state.snapshot!.booking;
      return html`<p class="sc-copy">Book your onboarding call with Harry. Once your Google Meet booking is confirmed and every other section is finished, you can open your dashboard.</p>
        ${c.bookingUrl ? html`<a class="sc-primary ob-link" href=${c.bookingUrl} target="_blank" rel="noopener noreferrer">Choose a call time ↗</a>` : html`<p class="sc-panel-card sc-copy">Harry’s scheduling link is not configured yet.</p>`}
        ${booking ? html`<section class="sc-panel-card"><h2 class="sc-label">${booking.status === "confirmed" ? "Booking confirmed" : "Booking cancelled"}</h2><p class="sc-copy my-3">${new Date(booking.startsAt).toLocaleString(undefined, { timeZone: d.routine.timezone })} · ${d.routine.timezone}</p>${booking.status === "confirmed" ? html`<a class="sc-secondary ob-link" href=${booking.meetUrl} target="_blank" rel="noopener noreferrer">Open Google Meet ↗</a>` : html`<p class="sc-copy">Choose a new time to complete this section.</p>`}</section>` : html`<p class="sc-copy">Opening the booking page does not complete this step. Use Refresh confirmation after booking.</p>`}
        <button class="sc-secondary" @click=${() => actions.propose({ kind: "refreshBooking" })}>Refresh confirmation</button>`;
    }
  }
  function questionField(key: Question) { return textField({ label: QUESTIONS[key], area: true, value: d.questionnaire[key], invalid: state.showMissing && !d.questionnaire[key].trim(), change: value => edit(state, actions, { ...d, questionnaire: { ...d.questionnaire, [key]: value } }) }); }
}
function previousUploads(state: State, actions: Actions) {
  const items = state.snapshot?.previousMedia ?? [];
  if (!items.length || state.section !== "measurements") return nothing;
  return html`<section class="sc-panel-card" aria-label="Earlier submissions"><h3 class="sc-label">Earlier submissions</h3><p class="sc-copy my-3">These files belong to an earlier version of your onboarding. You can download or remove them; the current assessment requirements are shown above.</p><fieldset class="ob-fields" ?disabled=${state.busy}>${items.map(item => {
    const label = mediaSlots(state.snapshot!.content).find(slot => slot.id === item.slot)?.label ?? "Mobility assessment";
    return html`<div class="ob-file"><p class="sc-copy">${label} · ${item.status === "ready" ? "Submitted" : "Unfinished upload"} · ${(item.size / 1024 / 1024).toFixed(1)} MiB</p><div class="flex flex-wrap gap-2">${item.status === "ready" ? html`<button class="sc-secondary" @click=${() => actions.propose({ kind: "read", mediaId: item.id })}>Download earlier ${label.toLowerCase()}</button>` : nothing}<button class="sc-secondary" @click=${() => actions.propose({ kind: "remove", mediaId: item.id })}>Remove earlier ${label.toLowerCase()}</button></div></div>`;
  })}</fieldset></section>`;
}
export function accountSetupView(state: State, actions: Pick<Actions, "propose" | "signOut">) {
  const routine = state.draft.routine;
  const change = (field: "name" | "timezone", value: string) => actions.propose({ kind: "edit", answers: { ...state.draft, routine: { ...routine, [field]: value } } });
  return html`<div class="sc-shell sc-workspace-body ob-shell"><header class="ob-header"><a class="sc-brand" href="/account/setup">Elite Body System</a><button class="sc-secondary" ?disabled=${state.busy} @click=${actions.signOut}>${state.accountBusy ? "Signing out…" : "Sign out"}</button></header>
    <section class="mx-auto w-full max-w-2xl py-8" aria-busy=${state.busy}><p class="sc-eyebrow">Before you begin</p><h1 class="sc-display ob-title" tabindex="-1">Account setup</h1>
      <p class="sc-copy my-6">Set your preferred name and time zone before starting your onboarding.</p>
      ${state.snapshot ? state.snapshot.completedAt ? html`<p class="sc-copy">Your account is already set up. You can update your details in Profile.</p><a class="sc-secondary ob-link mt-6" href="/?panel=profile">Open Profile</a><a class="sc-primary ob-link mt-6" href="/onboarding">Review onboarding</a>` : html`<form @submit=${(event: SubmitEvent) => { event.preventDefault(); actions.propose({ kind: "startOnboarding" }); }}>
        <fieldset class="ob-fields" ?disabled=${state.busy || state.reloadRequired}>
          ${textField({ label: "What do you prefer to be called?", value: routine.name, change: value => change("name", value) })}
          ${textField({ label: "Your time zone (for example Europe/London)", value: routine.timezone, change: value => change("timezone", value), invalid: !validTimezone(routine.timezone) })}
        </fieldset><button class="sc-primary mt-6 w-full" type="submit" ?disabled=${state.busy || state.reloadRequired}>${state.busy ? "Saving…" : "Continue to onboarding"}</button>
      </form>` : html`<p class="sc-copy" role="status">${state.busy ? "Loading your account…" : "Your account could not be loaded."}</p>`}
      <div class="ob-feedback" tabindex="-1">${state.error || state.accountProblem ? html`<p class="sc-error" role="alert">${state.error || state.accountProblem}</p>` : nothing}</div>
      ${state.reloadRequired || !state.snapshot && !state.busy ? html`<button class="sc-secondary" @click=${() => actions.propose({ kind: "reload" })}>Reload saved details</button>` : nothing}
    </section></div>`;
}
function contact(url: string) { return url ? html`<a class="sc-secondary ob-link" href=${url} target="_blank" rel="noopener noreferrer">Contact Harry ↗</a>` : nothing; }
function sectionNavigation(state: State, actions: Actions) {
  return html`<nav aria-label="Onboarding sections"><ol>${SECTIONS.map((section, index) => {
    const completed = !!state.snapshot && (!!state.snapshot.completedAt || state.snapshot.missing[section].length === 0);
    return html`<li><button class="ob-section ${state.section === section ? "ob-section-current" : ""}" aria-current=${state.section === section ? "step" : nothing} ?disabled=${state.busy || !state.snapshot} @click=${() => actions.propose({ kind: "section", section })}><span aria-hidden="true">${completed ? "✓" : index + 1}</span><span>${SECTION_LABELS[section]}${completed ? html`<span class="sr-only"> · Completed</span>` : nothing}</span></button></li>`;
  })}</ol></nav>`;
}

export function onboardingView(state: State, actions: Actions) {
  const snapshot = state.snapshot, done = snapshot ? SECTIONS.filter(section => !snapshot.missing[section].length).length : 0;
  return html`<div class="sc-shell sc-workspace-body ob-shell"><header class="ob-header"><a class="sc-brand" href="/onboarding">Elite Body System</a><button class="sc-secondary" ?disabled=${state.busy || state.saving} @click=${actions.signOut}>${state.accountBusy ? "Signing out…" : "Sign out"}</button></header>${state.accountProblem ? html`<p class="sc-error mt-4" role="alert">${state.accountProblem}</p>` : nothing}
    <div class="ob-layout"><aside class="ob-sidebar"><p class="sc-eyebrow">Your starting point</p><h1 class="sc-display text-4xl">Built around you.</h1><p class="sc-copy">${snapshot?.completedAt ? "Onboarding complete" : `${done} of 8 sections ready`}</p><progress class="sc-setup-progress-bar" aria-label="Onboarding sections ready" value=${snapshot?.completedAt ? 8 : done} max="8"></progress>
      <div class="ob-nav-desktop">${sectionNavigation(state, actions)}</div><details class="ob-nav-mobile"><summary class="sc-secondary">Choose a section · ${SECTIONS.indexOf(state.section) + 1} / 8</summary>${sectionNavigation(state, actions)}</details><p class="sc-copy text-xs">Your dashboard opens when every section is complete. Complete a section to save it, then return whenever you need.</p></aside>
    <section class="ob-main" aria-busy=${state.busy}><p class="sc-eyebrow">Onboarding · ${SECTIONS.indexOf(state.section) + 1} / 8</p><h2 class="sc-display ob-title" tabindex="-1">${SECTION_LABELS[state.section]}</h2>
      ${snapshot ? html`${snapshot.completedAt ? html`<p class="sc-panel-card sc-copy">Your onboarding is complete. Your saved answers are available below. Contact your coach if you need to correct an assessment.</p><a class="sc-primary ob-link" href="/">Open dashboard</a>` : nothing}
      <fieldset class="ob-fields" ?disabled=${state.busy || !!snapshot.completedAt || state.reloadRequired}>${sectionContent(state, actions)}</fieldset>${previousUploads(state, actions)}
      ${snapshot.completedAt && state.section === "measurements" ? html`<fieldset class="ob-fields" ?disabled=${state.busy}><legend class="sc-label">Manage your submitted files</legend>${uploadSlots(state, actions, "measurements")}${uploadSlots(state, actions, "audit")}</fieldset>` : nothing}` : html`<p class="sc-copy" role="status">${state.busy ? "Loading your saved onboarding…" : "Your onboarding could not be loaded."}</p>`}
      <div class="ob-feedback" tabindex="-1">${state.error ? html`<p class="sc-error" role="alert">${state.error}</p>` : nothing}${state.showMissing && state.missing?.[state.section].length ? html`<section class="sc-panel-card"><h3 class="sc-label">Still needed in this section</h3><ul class="sc-copy ob-missing">${state.missing[state.section].map(message => html`<li>${message}</li>`)}</ul></section>` : nothing}
      ${state.pending?.kind === "upload" ? html`<p class="sc-copy" role="status">${state.progress >= 100 || state.finalizing ? "Checking and saving your upload…" : `Uploading… ${state.progress}%`}</p><progress aria-label="Assessment upload" max="100" value=${state.progress}></progress><button class="sc-secondary" ?disabled=${state.finalizing} @click=${() => actions.propose({ kind: "cancelUpload" })}>${state.finalizing ? "Finishing upload…" : "Cancel upload"}</button>` : state.pending?.kind === "cancelUpload" ? html`<p class="sc-copy" role="status">Cancelling upload…</p>` : state.message ? html`<p class="sc-copy" role="status">${state.message}</p>` : nothing}
      ${state.reloadRequired || !snapshot && !state.busy ? html`<button class="sc-secondary" @click=${() => actions.propose({ kind: "reload" })}>Reload saved progress</button>` : nothing}</div>
      ${snapshot && !snapshot.completedAt ? html`<footer class="ob-actions"><button class="sc-primary" ?disabled=${state.busy || state.reloadRequired} @click=${() => actions.propose({ kind: state.section === "call" ? "complete" : "next" })}>${state.busy ? "Saving…" : state.section === "call" ? "Finish onboarding" : "Complete"}</button><p class="sc-copy text-xs" role="status" data-testid="onboarding-save-status">${state.saving ? "Saving answers…" : state.dirty ? state.section === "questionnaire" && !state.error ? "Changes waiting to save…" : "Complete this section to save your changes." : snapshot.revision === 0 ? "Complete this section to save your answers." : "Progress saved to your account"}</p></footer>` : nothing}
    </section></div></div>`;
}
