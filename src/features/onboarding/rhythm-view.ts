import { html, svg } from "lit-html";
import { WEEKLY_COACHING, WEEKLY_INTRODUCTION } from "./coaching-content.ts";

function rhythmIcon(id: typeof WEEKLY_COACHING[number]["id"]) {
  const shapes = {
    program: svg`<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 11h16m-11 4h6"/>`,
    feedback: svg`<path d="M8 4H4v16h16v-4M8 12l3 3L21 5M12 4h8v8"/>`,
    filming: svg`<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>`,
    "check-in": svg`<path d="M9 5H5v16h14V5h-4M9 3h6v4H9zM8 12l2 2 5-5m-7 9h8"/>`,
    communication: svg`<path d="M21 11a9 9 0 0 1-9 9H5l-3 2 1-6a9 9 0 1 1 18-5Z"/><path d="M7 11h.01M12 11h.01M17 11h.01"/>`,
  };
  return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[id]}</svg>`;
}

export function weeklyRhythmView() {
  const communication = WEEKLY_COACHING.find(section => section.id === "communication")!;
  return html`<p class="sc-copy">${WEEKLY_INTRODUCTION}</p><div class="ob-weekly-guide">${WEEKLY_COACHING.filter(section => section.id !== "communication").map(section => html`<section class="ob-rhythm-part"><span class="ob-rhythm-icon">${rhythmIcon(section.id)}</span><div><h2>${section.title}</h2>${section.paragraphs.map(paragraph => html`<p>${paragraph}</p>`)}</div></section>`)}</div>
    <section class="ob-coach-access" aria-label="Direct access to your coach"><span class="ob-rhythm-icon">${rhythmIcon("communication")}</span><div><p class="sc-eyebrow">Communication</p><h2>Direct access to your coach</h2><p>You have direct access to Harry through WhatsApp throughout your Elite Body System coaching.</p>${communication.paragraphs.map(paragraph => html`<p>${paragraph}</p>`)}</div></section>`;
}
