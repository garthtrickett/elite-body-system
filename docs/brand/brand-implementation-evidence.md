# Brand implementation evidence

Implemented and reviewed locally on 20 October 2026 against the [implementation plan](brand-implementation-plan.md) and [source findings](brand-foundations.md). This records the current application code and local verification, not a production deployment.

## Delivered

| Requirement | Implementation and evidence |
| --- | --- |
| Two-family typography | Self-hosted Instrument Serif Regular/Italic and Geist 400/500 WOFF2, explicit asset routes, swap loading, fallbacks and OFL notices. Browser checks load all three files, verify their HTTP MIME types, and check heading/input font families |
| Authoritative palette | `src/styles.css` defines `#11100E`, `#F3F0EA`, `#86827B` and `#6A6C4B`; derived semantic neutrals are listed below |
| Restrained olive | Only the small section icons and current-navigation marker use olive. Tiles, charts, choices and buttons remain neutral in both incomplete and completed states; no photo overlay or olive background was introduced |
| Honest progress | Checked/text completion states, plain streak text, neutral consistency cells with full/half/empty shapes, a labelled progress-card selector, and a neutral trend chart |
| Whole-app consistency | Authentication, setup/profile, scorecard, training, Neural Map, courses and meals use the same shared styling. The separate emerald sign-in design and lime literals are removed |
| Usable data and forms | Geist metrics/timers, compact treatment for long values, readable labels, visible units/errors, 44–48 px primary controls, and focus styling on links, selects, summaries, inputs and buttons |
| Responsive layout | Scorecard captures at 320, 390, 430, 768 and 1440 px; all current route families checked at 320 px, including long profile names/email and maximum target values. Below 380 px the tile grid uses two columns |
| Keyboard and reduced motion | Existing Enter/blur/Escape behaviour and native-dialog focus checks pass. Added link-focus and reduced-motion checks, plus emulated 200% zoom reflow and forced font-failure coverage. Navigation returns to document flow below 600 px viewport height so it cannot cover focused controls in short/zoomed layouts |
| Preserved behaviour | Only views, icons, styling, font delivery/build handling and verification changed. Core operations, SAM acceptors/effects, schema and generated database types remain unchanged |

The text logo is retained, primary buttons use off-white, and no new photography was added. These use the plan's defaults without resolving the deck's proposed-logo or olive-background ambiguity. Final artwork remains optional follow-up rather than a missing dependency for this functional app pass.

## Derived neutrals and contrast

The brighter supporting neutrals keep labels readable on raised and selected surfaces. Values below are app choices, not additional colours claimed from the PDF.

| Role | Hex | Contrast on off-black | On raised surface | On selected surface |
| --- | --- | --- | --- | --- |
| Primary text | `#F3F0EA` | 16.72:1 | 15.46:1 | 13.47:1 |
| Body/supporting copy | `#C8C2B8` | 10.74:1 | 9.93:1 | 8.66:1 |
| Muted labels/placeholder text | `#A6A095` | 7.32:1 | 6.77:1 | 5.90:1 |
| Interactive boundaries | `#767168` | 3.92:1 | 3.63:1 | 3.16:1 |

Raised surface: `#1A1916`; selected surface: `#27251F`. Errors use off-white text, a leading rule and invalid-field dashed underline; they are not distinguished by colour alone. Focus rings use off-white against the surrounding dark surface. Faint panel borders are decorative; essential input/button boundaries use the stronger border role. Disabled controls retain native disabled behaviour and reduced emphasis.

## Verification

The required command completed successfully:

```sh
bash scripts/with-postgres.sh npm run verify
git diff --exit-code -- src/platform/database/generated
git diff --check
```

Results: **59 server/model tests and 19 Chromium tests passed**, plus migrations, Kanel generation, convention checks, strict typecheck and production asset build. The generated-schema check had no diff.

The initial focused browser run omitted migrations and failed to provision accounts. The corrected isolated run passed all eight auth/scorecard checks. Targeted state checks subsequently passed, covering loading, invalid entry, saving, failed-save recovery, saved-value persistence, route reflow, long profile content, selected choices and forced font failure.

Visual inspection caught and corrected wrapping training tabs and the cramped meal photo picker. It also caught a screenshot-harness issue with temporary zoom metrics; the final check uses a stable 720 CSS-pixel context at device scale factor 2, representing 200% reflow on a 1440-pixel display. Dialog screenshots capture the viewport rather than the underlying full document. The corrected zoom capture then exposed focus overlap with sticky navigation: a short-viewport layout rule and scroll spacing fix that, and the browser test checks action/navigation bounds explicitly. The final full verification includes this refinement.

A separate isolated browser review verified empty training history, the active rest timer's Geist font, and disabled fields/finish action on a future session at 320 px. Existing suite coverage also verifies training health holds, session persistence, timer recovery, course progress, meal logging and account isolation.

Source and built CSS/JavaScript audits found no legacy lime/emerald styling or references to Bebas Neue/Work Sans. Old font source files and public routes were removed; incremental builds clear stale font output. No third-party font request is required.

These checks use Chromium with emulated viewports and zoom reflow; they do not claim physical-device, Safari or assistive-technology testing. Screenshots use isolated fixture accounts, never real client data.

## Retained screenshots

| State | Artifact |
| --- | --- |
| Baseline sign-in | [Before](screenshots/before-sign-in.png) |
| Baseline scorecard | [Before](screenshots/before-scorecard.png) |
| Branded sign-in | [Desktop](screenshots/sign-in.png) |
| Normal scorecard | [Mobile](screenshots/scorecard.png) |
| Completed scorecard | [Complete](screenshots/scorecard-complete.png) |
| Loading scorecard | [Loading](screenshots/scorecard-loading.png) |
| Invalid field | [Validation](screenshots/scorecard-invalid.png) |
| Saving scorecard | [Saving](screenshots/scorecard-saving.png) |
| Save failure and retry controls | [Failure](screenshots/scorecard-save-failed.png) |
| Selected setup choices | [Setup](screenshots/setup-selected-choices.png) |
| Emulated 200% reflow | [Zoom](screenshots/scorecard-200-percent.png) |
| Font-failure fallback | [Fallback](screenshots/sign-in-fallback-fonts.png) |
| Active training timer | [Training](screenshots/training-timer.png) |
| Future session read-only state | [Read only](screenshots/training-read-only.png) |
| Neural Map | [Map](screenshots/neural-map.png) |
| Course tasks | [Course](screenshots/course.png) |
| Meal review | [Meal](screenshots/meal-review.png) |

Full-page scorecard captures include sticky navigation at the browser viewport's edge; content remains reachable by normal scrolling. The retained images are review snapshots, not an automated pixel-baseline suite.
