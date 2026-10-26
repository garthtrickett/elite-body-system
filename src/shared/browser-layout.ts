import { html, nothing } from "lit-html";
import type { TemplateResult } from "lit-html";

export type WorkspacePage = "scorecard" | "training" | "meals" | "map" | "mindset" | "nutrition" | "activity" | "media";
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

/** Feature presentation is restricted to the content outlet and its mobile feedback. */
export function workspace(input: Readonly<{
  content: TemplateResult; mobileFooter?: TemplateResult | undefined;
}>) {
  return html`<div class="sc-shell sc-workspace-body" id="workspace-content">${input.content}</div>
    ${input.mobileFooter ? html`<div class="sc-mobile-footer">${input.mobileFooter}</div>` : nothing}`;
}

/** The same Lit template updates selection without replacing navigation nodes. */
export function workspaceShell(input: Readonly<{
  page: WorkspacePage | "onboarding"; panel?: string | undefined; outlet: HTMLElement;
  navigationDisabled: boolean; status: string; retry?: (() => void) | undefined;
}>) {
  const panel = input.page === "onboarding" ? "setup" : input.page === "scorecard" && (input.panel === "profile" || input.panel === "setup") ? input.panel : undefined;
  const moreActive = !panel && input.page !== "scorecard" && input.page !== "training";
  const items = (entries: readonly NavigationItem[]) => entries.map(item => html`<a class="sc-sidebar-link" href=${item.href}
    aria-current=${input.page === item.page && !panel ? "page" : nothing} aria-disabled=${input.navigationDisabled ?? false}>${item.label}</a>`);
  return html`<div class="sc-app"><div class="sc-workspace">
    <aside class="sc-sidebar" aria-label="Elite Body System workspace">
      <a class="sc-sidebar-brand" href="/" aria-label="Elite Body System home" aria-disabled=${input.navigationDisabled ?? false}>Elite Body<br>System<span class="sc-eyebrow">Build your standard.</span></a>
      <nav class="sc-sidebar-nav" aria-label="Workspace navigation">
        <div class="sc-sidebar-group"><p class="sc-eyebrow">Daily practice</p>${items(practice)}</div>
        <div class="sc-sidebar-group"><p class="sc-eyebrow">Your courses</p>${items(courses)}</div>
        <div class="sc-sidebar-group sc-sidebar-account"><p class="sc-eyebrow">Your account</p>
          <a class="sc-sidebar-link" href="/account/media" aria-current=${input.page === "media" ? "page" : nothing} aria-disabled=${input.navigationDisabled}>Media preferences</a>
          ${([ ["setup", "Day 1 setup"], ["profile", "Profile"] ] as const).map(([key, label]) => html`<a class="sc-sidebar-link" href=${`/?panel=${key}`} aria-current=${panel === key ? "page" : nothing} aria-disabled=${input.navigationDisabled ?? false}>${label}</a>`)}
        </div>
      </nav>
      <p class="sc-sidebar-footer">One system.<br>A standard for life.</p>
    </aside>
    ${input.outlet}
    <div class="sc-route-status" role="status" ?hidden=${!input.status}>${input.status}${input.retry ? html` <button class="sc-secondary" @click=${input.retry}>Retry navigation</button>` : nothing}</div>
    <nav class="sc-mobile-nav" aria-label="Main navigation">
      <a class="sc-nav-button ${panel === "setup" ? "sc-nav-active" : ""}" aria-current=${panel === "setup" ? "page" : nothing} href="/?panel=setup" aria-label="Day 1 setup" aria-disabled=${input.navigationDisabled ?? false}>Setup</a>
      <a class="sc-nav-button ${input.page === "training" ? "sc-nav-active" : ""}" href="/training" aria-current=${input.page === "training" ? "page" : nothing} aria-label="Training" aria-disabled=${input.navigationDisabled ?? false}>Train</a>
      <a class="sc-nav-button ${input.page === "scorecard" && !panel ? "sc-nav-active" : ""}" href="/" aria-current=${input.page === "scorecard" && !panel ? "page" : nothing} aria-disabled=${input.navigationDisabled ?? false}>Scorecard</a>
      <a class="sc-nav-button ${panel === "profile" ? "sc-nav-active" : ""}" aria-current=${panel === "profile" ? "page" : nothing} href="/?panel=profile" aria-disabled=${input.navigationDisabled ?? false}>Profile</a>
      <div class="sc-mobile-more"><button class="sc-nav-button ${moreActive ? "sc-nav-active" : ""}" aria-current=${moreActive ? "true" : nothing} aria-label="More navigation" popovertarget="workspace-more-menu">More <span aria-hidden="true">⌃</span></button>
        <div class="sc-mobile-menu" id="workspace-more-menu" popover="auto"><p class="sc-eyebrow">Daily practice</p>${items(practice.slice(2))}<p class="sc-eyebrow">Your courses</p>${items(courses)}<p class="sc-eyebrow">Your account</p><a class="sc-sidebar-link" href="/account/media" aria-disabled=${input.navigationDisabled}>Media preferences</a>

        </div>
      </div>
    </nav>
  </div></div>`;
}
