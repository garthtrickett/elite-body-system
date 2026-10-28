import { html, nothing } from "lit-html";
import type { ManagementViewInput } from "./management-view.ts";
export function callScript(input: ManagementViewInput) {
    const { state } = input, snapshot = state.snapshot;
    if (!snapshot)
        return nothing;
    const lead = snapshot.leads.find(l => l.id === state.selected);
    return html `<section class="mp-panel"><p class="mp-eyebrow">Private · EBS sales conversation</p><h2>CLOSER call guide</h2><p class="mp-muted">Understand the person, confirm the problem and help them make a clear decision. Use their words and relevant evidence. The conversation leads; the guide keeps it focused.</p><p class="mp-muted mp-small">Adapted from Alex Hormozi’s CLOSER framework for Elite Body System. This guide is visible only to authorised managers.</p></section>
    ${lead ? html `<section class="mp-panel"><p class="mp-eyebrow">Prepare for the call</p><h2>${lead.name}</h2><div class="mp-two"><dl class="mp-answers">${([['Role & business', 'role'], ['Their goal', 'goal'], ['Current training', 'training'], ['What has stopped progress', 'obstacle'], ['Investment readiness', 'invest']] as const).map(([label, key]) => lead.application[key] ? html `<div><dt>${label}</dt><dd>${lead.application[key]}</dd></div>` : nothing)}</dl><div><h3>Your notes</h3><p class="mp-script-note">${lead.notes || "No private notes yet."}</p><a href=${`/manage/sales?lead=${lead.id}&before=${encodeURIComponent(state.before)}&search=${encodeURIComponent(state.search)}`}>Return to lead and update notes →</a></div></div></section>` : html `<p class="mp-muted">Open the call guide from a lead to bring their application and notes into this conversation.</p>`}
    <div class="mp-script">${snapshot.callScript.map((part, i) => html `<details class="mp-panel mp-script-step" ?open=${i === 0}><summary><span class="mp-number">${part.step}</span><h2>${part.title}</h2></summary><div class="mp-script-content"><blockquote>${part.prompt}</blockquote><ul>${part.questions.map(q => html `<li>${q}</li>`)}</ul><p class="mp-muted mp-small">${part.note}</p></div></details>`)}</div>
    <section class="mp-panel"><p class="mp-eyebrow">Record once · Call booking introduction</p><h2>Your introduction video script</h2><p class="mp-script-note">${snapshot.mentorIntroScript}</p><a href="/manage/sales?tab=pages">Add the finished video in Funnel pages →</a></section>`;
}
