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
  navigate?: (href: string) => void;
  mobileFooter?: TemplateResult | undefined;
  openPanel?: (panel: "profile" | "setup") => void;
}>) {
  const guard = (event: Event) => {
    if (input.navigationDisabled) { event.preventDefault(); return; }
    if (!input.navigate || !(event.currentTarget instanceof HTMLAnchorElement)) return;
    if (event instanceof MouseEvent && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
    event.preventDefault(); input.navigate(event.currentTarget.getAttribute("href") ?? "/");
  };
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
            ? html`<button class="sc-sidebar-link" ?disabled=${input.navigationDisabled ?? false} @click=${() => input.openPanel?.(panel)}>${label}</button>`
            : html`<a class="sc-sidebar-link" href=${`/?panel=${panel}`} aria-disabled=${input.navigationDisabled ?? false} @click=${guard}>${label}</a>`)}
        </div>
      </nav>
      <p class="sc-sidebar-footer">One system.<br>A standard for life.</p>
    </aside>
    <div class="sc-shell sc-workspace-body" id="workspace-content">${input.content}</div>
    ${input.mobileFooter ? html`<div class="sc-mobile-footer">${input.mobileFooter}</div>` : nothing}
    <nav class="sc-mobile-nav" aria-label="Main navigation">
      ${input.openPanel ? html`<button class="sc-nav-button" aria-label="Day 1 setup" ?disabled=${input.navigationDisabled ?? false} @click=${() => input.openPanel?.("setup")}>Setup</button>` : html`<a class="sc-nav-button" href="/?panel=setup" aria-disabled=${input.navigationDisabled ?? false} @click=${guard}>Setup</a>`}
      <a class="sc-nav-button ${input.page === "training" ? "sc-nav-active" : ""}" href="/training" aria-current=${input.page === "training" ? "page" : nothing} aria-label="Training" aria-disabled=${input.navigationDisabled ?? false} @click=${guard}>Train</a>
      <a class="sc-nav-button ${input.page === "scorecard" ? "sc-nav-active" : ""}" href="/" aria-current=${input.page === "scorecard" ? "page" : nothing} aria-disabled=${input.navigationDisabled ?? false} @click=${guard}>Scorecard</a>
      ${input.openPanel ? html`<button class="sc-nav-button" ?disabled=${input.navigationDisabled ?? false} @click=${() => input.openPanel?.("profile")}>Profile</button>` : html`<a class="sc-nav-button" href="/?panel=profile" aria-disabled=${input.navigationDisabled ?? false} @click=${guard}>Profile</a>`}
      <div class="sc-mobile-more"><button class="sc-nav-button ${input.page !== "scorecard" && input.page !== "training" ? "sc-nav-active" : ""}" aria-current=${input.page !== "scorecard" && input.page !== "training" ? "true" : nothing} aria-label="More navigation" popovertarget="workspace-more-menu">More <span aria-hidden="true">⌃</span></button>
        <div class="sc-mobile-menu" id="workspace-more-menu" popover="auto"><p class="sc-eyebrow">Daily practice</p>${items(practice.slice(2))}<p class="sc-eyebrow">Your courses</p>${items(courses)}

        </div>
      </div>
    </nav>
  </div></div>`;
}
