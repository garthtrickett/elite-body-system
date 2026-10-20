import { svg } from "lit-html";

export type IconName = "nutrition" | "activity" | "mindset" | "flag" | "scorecard" | "profile" | "check" | "back" | "plus" | "star";
export function icon(name: IconName) {
  const paths = {
    nutrition: svg`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>`,
    activity: svg`<path d="M6.5 6.5l11 11M4 4l2.5 2.5M20 20l-2.5-2.5M2 9l3 3-3 3M22 15l-3-3 3-3M9 2l3 3 3-3M15 22l-3-3-3 3"/>`,
    mindset: svg`<circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="12" cy="13" r="2.2"/><circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="19" r="2.2"/><path d="M7.6 7.3l3 4.1m5.8-4.1l-3 4.1m-2.8 3.2l-3 3.1m5.8-3.1l3 3.1"/>`,
    flag: svg`<path d="M5 21V4m0 0h11l-2 4 2 4H5"/>`,
    scorecard: svg`<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>`,
    profile: svg`<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>`,
    check: svg`<path d="M20 6L9 17l-5-5"/>`,
    back: svg`<path d="M15 18l-6-6 6-6"/>`,
    plus: svg`<path d="M12 5v14M5 12h14"/>`,
    star: svg`<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>`,
  };
  return svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}
