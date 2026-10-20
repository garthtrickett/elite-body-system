import { html, nothing } from "lit-html";
import type { TemplateResult } from "lit-html";

export type WorkspacePage = "scorecard" | "training" | "meals" | "map" | "mindset" | "nutrition" | "activity";
type NavigationItem = Readonly<{ page: WorkspacePage; label: string; href: string }>;
const practice: readonly NavigationItem[] = [
  { page: "scorecard", label: "Scorecard", href: "/" },
  { page: "training", label: "Training", href: "/training" },
  { page: "meals", label: "Meals", href: "/meals" },
  { page: "map", label: "Neural Map", href: "/mindset/map" },
];
const courses: readonly NavigationItem[] = [
  { page: "mindset", label: "Mindset", href: "/courses/mindset" },
  { page: "nutrition", label: "Nutrition", href: "/courses/nutrition" },
  { page: "activity", label: "Activity", href: "/courses/activity" },
];

/** Presentation only: each feature still owns its model, actions and effects. */
export function workspace(input: Readonly<{
  page: WorkspacePage;
  content: TemplateResult;
  navigationDisabled?: boolean;
  mobileFooter?: TemplateResult | undefined;
  openPanel?: (panel: "profile" | "setup") => void;
}>) {
  const guard = (event: Event) => { if (input.navigationDisabled) event.preventDefault(); };
  const items = (entries: readonly NavigationItem[]) => entries.map(item => html`<a class="sc-sidebar-link" href=${item.href}
    aria-current=${input.page === item.page ? "page" : nothing} aria-disabled=${input.navigationDisabled ?? false} @click=${guard}>${item.label}</a>`);
  return html`<div class="sc-app"><div class="sc-workspace">
    <aside class="sc-sidebar" aria-label="Elite Body System workspace">
      <a class="sc-sidebar-brand" href="/" aria-label="Elite Body System home" aria-disabled=${input.navigationDisabled ?? false} @click=${guard}>Elite Body<br>System<span class="sc-eyebrow">Build your standard.</span></a>
      <nav class="sc-sidebar-nav" aria-label="Workspace navigation">
        <div class="sc-sidebar-group"><p class="sc-eyebrow">Daily practice</p>${items(practice)}</div>
        <div class="sc-sidebar-group"><p class="sc-eyebrow">Your courses</p>${items(courses)}</div>
        <div class="sc-sidebar-group sc-sidebar-account"><p class="sc-eyebrow">Your account</p>
          ${([ ["setup", "Day 1 setup"], ["profile", "Profile"] ] as const).map(([panel, label]) => input.openPanel
            ? html`<button class="sc-sidebar-link" @click=${() => input.openPanel?.(panel)}>${label}</button>`
            : html`<a class="sc-sidebar-link" href=${`/?panel=${panel}`} aria-disabled=${input.navigationDisabled ?? false} @click=${guard}>${label}</a>`)}
        </div>
      </nav>
      <p class="sc-sidebar-footer">One system.<br>A standard for life.</p>
    </aside>
    <div class="sc-shell sc-workspace-body" id="workspace-content">${input.content}</div>
    ${input.mobileFooter ? html`<div class="sc-mobile-footer">${input.mobileFooter}</div>` : nothing}
    <nav class="sc-mobile-nav" aria-label="Main navigation">
      ${input.openPanel ? html`<button class="sc-nav-button" aria-label="Day 1 setup" @click=${() => input.openPanel?.("setup")}>Setup</button>` : html`<a class="sc-nav-button" href="/?panel=setup" aria-disabled=${input.navigationDisabled ?? false} @click=${guard}>Setup</a>`}
      <a class="sc-nav-button ${input.page === "training" ? "sc-nav-active" : ""}" href="/training" aria-current=${input.page === "training" ? "page" : nothing} aria-label="Training" aria-disabled=${input.navigationDisabled ?? false} @click=${guard}>Train</a>
      <a class="sc-nav-button ${input.page === "scorecard" ? "sc-nav-active" : ""}" href="/" aria-current=${input.page === "scorecard" ? "page" : nothing} aria-disabled=${input.navigationDisabled ?? false} @click=${guard}>Scorecard</a>
      ${input.openPanel ? html`<button class="sc-nav-button" @click=${() => input.openPanel?.("profile")}>Profile</button>` : html`<a class="sc-nav-button" href="/?panel=profile" aria-disabled=${input.navigationDisabled ?? false} @click=${guard}>Profile</a>`}
      <details class="sc-mobile-more"><summary class="sc-nav-button" aria-label="More navigation">More <span aria-hidden="true">⌃</span></summary>
        <div class="sc-mobile-menu"><p class="sc-eyebrow">Daily practice</p>${items(practice.slice(2))}<p class="sc-eyebrow">Your courses</p>${items(courses)}

        </div>
      </details>
    </nav>
  </div></div>`;
}
