# Applying the brand foundations to Harry's app

Status: implemented in the current app on 20 October 2026. The proposal below is retained as the implementation checklist; [implementation evidence](brand-implementation-evidence.md) records the delivered choices, screenshots and verification. This does not claim a production deployment.

References: [brand findings](brand-foundations.md) and [original brand pack](Harry%20Baldwin%20-%20Brand%20Foundations%20v1.0.pdf). PDF page numbers below identify the source direction. The findings describe the brand; this plan describes how to apply it to the existing app.

## Intended result

Make the app feel like Harry's method: calm, direct and disciplined, with readable daily information and restrained progress feedback. Carry one visual language from sign-in through setup, the scorecard and training. Preserve the useful workflows and make state changes obvious without neon completion fills or motivational decoration.

The first implementation should restyle existing functionality. The PDF's course, website, watch and device mockups are visual references; they do not create new product requirements. The four brand pillars do not require renaming or restructuring the app's existing three scorecard groups. Product taxonomy needs a separate decision.

## Current app and proposed changes

This inventory reflects the working tree inspected on 20 October 2026, including ongoing profile and training work. Recheck the files before implementation rather than assuming this snapshot is the final feature set.

| Before | After | Why |
| --- | --- | --- |
| Bebas Neue display type and Work Sans interface type in `src/styles.css`; global sans token names Inter | Instrument Serif for selected headings and coaching statements; Geist for interface text and functional numbers | Match the two-family system on p. 13 and remove conflicting font defaults |
| Lime `#D8FF3D`, cool neutrals and pure-white text | Warm source palette with semantic tokens for every surface and state | Apply pp. 14–15 consistently |
| Completed tiles and selected choices fill with bright accent | Neutral surfaces, readable state text and checks; small accent details where useful | Keep progress clear while reducing accent coverage |
| Flame streak badge in the scorecard header | Plain, subordinate continuity text if the underlying streak remains useful | Apply p. 21's rejection of flames and badges without changing streak calculations |
| Emerald/lime sign-in styling, decorative bars and generic fresh-start messaging | Same warm palette and font hierarchy as the signed-in app; concise sign-in instructions | Avoid a separate visual identity at the entrance |
| Hard-coded lime in the trend SVG | Token-driven high-contrast line, neutral supporting area, text summary | A global accent replacement will otherwise miss chart literals |
| Small labels, fixed numeric widths and strong weight/uppercase conventions | Readable responsive labels, remeasured fields and selective emphasis | Geist and Instrument Serif have different proportions from the current fonts |
| Shared `sc-*` controls and panels used across scorecard, profile and training | A small consistent set of buttons, inputs, choices, surfaces and feedback styles | Make recurring actions feel the same across features |
| Training timers currently use `sc-display`, with olive-targeted text roles inherited from the accent | Geist timer numerals and units with strong neutral contrast | Repeatedly changing functional data should remain easy to scan |

## Decisions and practical defaults

Proceed with the explicit palette and font direction. The following defaults make a first review possible without inventing a final brand system:

| Topic | Proposed default | What remains open |
| --- | --- | --- |
| Olive surfaces | Use off-white primary buttons with off-black text; neutral selected tiles with checks. Keep olive to small indicators and details | The pack prohibits backgrounds on p. 15 but shows olive-filled controls on pp. 20–23. Confirm the exception before introducing olive-filled buttons or panels |
| Numerals | Geist for editable fields, counters, units and data; Instrument Serif for day/session headings | Review serif treatment for a non-editable hero metric if requested; mockups and written type roles differ |
| Logo | Use the existing text name, styled in the new system | Obtain approved vector artwork and confirmation of the proposed logo before replacing marks |
| Photography | Ship the functional app pass without new photography | Add supplied, approved images later where they help the task; the PDF is not an asset library |
| Surface/radius system | Warm neutral surfaces with restrained borders and modest rounding | Exact secondary colours, radii and responsive scale are app proposals, not printed brand specifications |

Logo and photo decisions need not block typography, tokens, controls or layout. The final font files and licences must be obtained before the font implementation is considered complete. Record resolved decisions in this plan when implementing; do not silently turn recommendations into source rules.

## 1. Establish the styling foundations

### Colours and semantic roles

Keep the four authoritative colours together in `src/styles.css` and expose semantic Tailwind/CSS tokens for components. Retain the current Tailwind build; no new design-system package is needed.

| Source colour | Value | Proposed app role |
| --- | --- | --- |
| Off-black | `#11100E` | Main background and dark text on light controls |
| Off-white | `#F3F0EA` | Primary text on dark surfaces and primary button fill |
| Grey | `#86827B` | Secondary text on the main dark background, subject to checking each surface |
| Olive | `#6A6C4B` | Sparse brand accents, never the only state indicator |

Add semantic roles for background, raised surface, primary/secondary text, border, primary action, selected state, focus and problem feedback. Secondary surface and border values are derived implementation choices: select and document them during the first screen pass, then check actual contrast. Avoid spreading new hex literals through feature templates.

The findings calculate off-white/off-black at 16.72:1, grey/off-black at 4.97:1, olive/off-black at 3.49:1 and off-white/olive at 4.78:1. These apply only to the exact solid pairs. Grey will need reassessment on raised surfaces; opacity can undermine otherwise adequate contrast. Keep small functional text off-white or a checked neutral rather than olive.

Use a strong, visible focus treatment on every interactive element, including links and native selects. The current scorecard selector only names buttons, inputs and textareas. Neutral high-contrast focus styling is compatible with the palette. Errors need explanatory text and a visible field association, not a broad olive/red fill or a colour-only signal.

Apply the under-5% olive rule as a visual budget per screen and relevant UI state, including a fully completed scorecard and a setup screen with many selected choices. Do not interpret it as a requirement for brittle pixel-count tests. Keep large charts, filled cards and backgrounds neutral. Avoid olive overlays on photographs.

### Font assets and loading

Obtain Instrument Serif Regular and Italic, plus Geist Regular and Medium. Verify licences, preserve required notices, and prefer self-hosted WOFF2 assets where available. Use actual 400/500 styles rather than synthetic bold; remove inherited 600–800 weight treatments where they conflict with the available fonts.

Define `@font-face` with `font-display: swap`, appropriate fallback families and explicit style/weight declarations. Set the global sans family to Geist. Apply Instrument Serif through a display role, with italics used deliberately rather than on every heading. Use tabular numerals for frequently changing data if supported by the selected Geist files.

The existing build copies `src/assets/fonts` into `dist/fonts`; `src/platform/application.ts` separately allowlists font URLs. Update both delivery and CSS references, including MIME types for the chosen format. Keep same-origin font loading under the existing CSP. Only preload a measured critical font if needed; avoid preloading every face.

Verify font responses, computed families, loading/fallback behaviour and layout after the fonts resolve. Recheck every fixed-width numeric field: the existing `ch` widths and fixed heights were tuned for Bebas Neue. Remove old font assets only once all references have been checked.

### Proposed scale for the first screen review

These are starting values for the app, not specifications from the PDF:

| Role | Starting treatment |
| --- | --- |
| Main day/title | Instrument Serif 400, 40–48 px, line-height about 1.1 |
| Panel/session title | Instrument Serif 400, 28–36 px, line-height about 1.15 |
| Body/instructions | Geist 400, 14–16 px, line-height about 1.5 |
| Controls and labels | Geist 400/500, generally 12–16 px; form input text 16 px |
| Data | Geist 400/500, sized by hierarchy; clear units and sufficient room for realistic values |
| Layout | Start with a 4/8 px spacing rhythm, 20–24 px content insets and 16–24 px between groups |

Do not preserve 9–10 px essential labels merely to fit the existing grid. Increase space or change responsive layout when needed. Keep all-caps to short labels where it helps scanning; the new serif titles should not inherit condensed-font tracking.

## 2. Build one representative screen before expanding

Start with the scorecard, which exercises headings, metrics, controls, charts, completion, navigation and saving feedback. Reuse the current view structure initially, then adjust hierarchy only where necessary for readability.

- Present the day clearly and keep saving/error status close enough to be noticed.
- Use neutral nutrition, activity and mindset groups with distinct labels and sufficient separation.
- Keep inline entry, units, targets and field errors readable. Preserve Enter/blur commit and Escape cancellation.
- Represent completion with a check and text. A completed tile must remain editable and visibly interactive.
- Keep the progress carousel operable through its labelled buttons as well as touch. Do not make muted dots the sole indication of the selected card.
- Replace the trend SVG's literal lime stroke/fill with semantic styles. Show chart information in accessible text as well as visually.
- Replace the flame badge with quiet continuity text, and replace “Smashed” with “Complete” where it labels the completed training state.
- Review all-complete, partially complete, empty, invalid, loading, saving and save-failed states. Keep retries and unsaved-change messages explicit.

Keep the current mobile-first shell during this pass; do not assume the PDF's desktop mockup requires a new dashboard. Review the existing centred layout at larger widths, and retain comfortable scrolling, safe-area padding and reachable navigation.

Keep numerical continuity, consistency and personal-record information factual. Removing a flame or a badge treatment does not remove the underlying history or change how a record is calculated. Show training PRs as plain supporting data rather than introducing achievement rewards.

## 3. Extend the same system across existing flows

| Surface | Apply | Preserve |
| --- | --- | --- |
| Sign-in request and confirmation | Warm palette, serif heading, Geist forms, restrained text branding; replace emerald bars and generic promotional copy | Explicit account confirmation, expiry explanations, request-new-link path, busy/error feedback and keyboard flow |
| Setup/onboarding | Consistent question hierarchy, readable choices, neutral selection states, clear progress and continuation controls | Saved progress, conditional questions, health/consent draft notices and actual validation behaviour |
| Profile and targets | Consistent labels, unit treatment, editable fields, grouped information and save feedback | Current values, consent/clearance wording and explicit save states |
| Training overview, exercise instructions and session controls | Serif session titles, Geist sets/reps/load/timer text, neutral cards and concise actions | Session rules, holds, logging, navigation, timer behaviour and any existing form/state protections |
| Map, L to R, goals and Focus | Readable long text, usable textareas, clear priority and completion affordances | User wording, priority semantics, keyboard editing and persistence |
| Course/meal preview panels and other available content | Consistent typography and explicit availability/status copy | Honest preview boundaries; styling must not imply that unavailable features work |

Style the rendered surfaces that exist at implementation time. Learning/content modules currently exist alongside browser features; inspect their actual entry points before claiming that they have a separate screen to restyle. Do not add navigation or UI solely because a data module exists.

Photography should support a future welcome, course or exercise context rather than decorate daily input forms. If introduced, use approved originals, appropriate crops, useful alternative text or decorative empty alternatives, reserved image dimensions and optimised local assets. Keep essential instructions out of background images and check overlays for legibility.

## 4. Copy and interaction treatment

Use short action labels such as “Save targets”, “Start session”, “Continue” and “Try again” where they match the operation. Keep necessary explanations and safety/consent information intact. Avoid promising successful storage or delivery before the corresponding operation succeeds.

Use a small number of purposeful transitions. Daily number entry, keyboard navigation and repeated set logging should feel immediate. For occasional state changes, begin with short transitions on explicitly named properties; avoid celebratory motion, automatic count-ups, bounce and `transition: all`. Preserve reduced-motion support and ensure touch actions do not depend on hover. Press feedback may be subtle for pointer use, with no keyboard-induced movement.

Use shared styles for repeated visual roles without introducing a generic component framework. Keep lit-html templates responsible for rendering and emitting existing actions. Model acceptance, next-action effects, correlated responses and bearer-secret handling remain governed by the existing SAM architecture. A visual change should not require new database migrations or alter completion rules.

## File-level implementation map

Paths below are relative to the repository root:

| Area | Expected files | Work |
| --- | --- | --- |
| Shared styling | `src/styles.css` | Authoritative brand palette, semantic tokens, font faces, type hierarchy, controls, surfaces, responsive and focus states |
| Font delivery | `src/assets/fonts/`, `scripts/build.ts`, `src/platform/application.ts` | Local assets/licences, build output and explicit public font routes |
| Authentication | `src/features/auth/browser-view.ts` | Remove emerald/lime presentation; apply shared visual roles and concise copy |
| Scorecard and panels | `src/features/scorecard/browser-view.ts`, `browser-panels.ts`, `icons.ts` | State presentation, chart literals, flame removal, heading/copy adjustments and navigation styles |
| Setup/profile | `src/features/profile/browser-view.ts` | Forms, questions, choice states and long-content layout |
| Training | `src/features/training/browser-view.ts` | Session/exercise hierarchy, readable controls and state feedback |
| Verification | `test/browser/` and existing feature tests | Behaviour regression and targeted visual/asset verification |

Keep feature imports through the existing server/browser entry points. Share presentation roles in the stylesheet; do not reach into another feature's internals or change core operations to make styling easier. Reconcile with concurrent work before editing these files.

## Delivery sequence and review evidence

| Step | Deliverable | Exit condition |
| --- | --- | --- |
| 1. Baseline | Current screenshots and a concise inventory of the flows present in the checkout | Existing issues and ongoing work are distinguishable from redesign regressions |
| 2. Foundations | Font assets/licences, palette, semantic styles and scorecard first pass | Fonts load locally; realistic values and errors fit; no broad lime/olive fills |
| 3. Representative review | Mobile/desktop scorecard images, including completed and failed-save states | Hierarchy, type scale, controls and accent usage form a coherent direction; record any required adjustments |
| 4. Rollout | Authentication, setup/profile, training and current content panels using the same styles | No emerald/lime island remains; every existing interactive state is usable |
| 5. Verification | Behaviour results, font/network checks, contrast checks and final screenshots | Acceptance criteria below pass and remaining asset/design decisions are explicit |

Use small, reviewable commits when implementation is requested. A reversible styling pass can be rolled back independently of domain logic or data migrations. Do not invent an additional mandatory approval gate for routine choices; use the defaults above, reserving unresolved logo/artwork and source contradictions for explicit decisions when they affect the proposed result.

## Acceptance criteria

- Instrument Serif Regular/Italic and Geist Regular/Medium are served locally, with licence notices, sensible fallbacks and no missing font requests or synthetic heavy weights.
- The exact source palette is defined centrally. No active UI still depends on `#D8FF3D`, emerald/lime utility styling, Bebas Neue or Work Sans. Audit templates, charts and compiled output as well as the stylesheet; archived documentation may retain historical references.
- Olive stays subordinate across incomplete, all-complete and heavily selected states. Selected, complete, focused, busy, disabled and invalid controls are distinguishable without colour alone.
- Scorecard, authentication, setup/profile and training share consistent type, controls and feedback. Existing forms, links, dialogs and navigation remain operable.
- Review at 320, 390, 430, 768 and 1440 px widths, including long names/emails, multi-digit values and units. Test 200% zoom, keyboard-only use and reduced motion; no clipped content, blocked primary action or unintended horizontal scrolling.
- Keep visible labels, accessible names, logical headings, focus visibility/restoration, dialog keyboard behaviour and live save/error feedback. Charts and completion indicators retain meaningful textual alternatives.
- As project acceptance targets, check normal text at 4.5:1 contrast and large text at 3:1; essential non-text boundaries and state indicators should reach 3:1 against adjacent surfaces. Check rendered colours, not just source tokens. Aim for 44 × 44 px primary touch targets, using invisible padding where appropriate, and separate adjacent controls. These are implementation targets rather than values specified by the deck.
- Copy is specific and restrained. No flames, promotional countdowns, confetti, exaggerated completion language or unverified outcome claims are added. Preview and draft notices remain accurate.
- Reviewed screenshots show the normal screen, empty/loading screen, invalid field, saving/failure state, completed scorecard, selected setup choices and an active training session. Use controlled fixture data and inspect font-resolved screenshots. Include training hold, read-only future session, empty history and timer states in the functional review.
- Run narrow affected browser checks first, then the repository's full `bash scripts/with-postgres.sh npm run verify` and generated-schema no-diff check for the implementation. Follow current shared-compute and tracked-job conventions. Do not change tests or business rules merely to make a visual pass green.

The original planning-only change required documentation/link checks. The implementation has now been verified separately; see the evidence record rather than treating this checklist as proof of completion.

## Refinement record

The first pass mapped the source findings to the actual stylesheet, font delivery, authentication, profile, scorecard and training views. The second pass checked asset dependencies, extreme completion/selection states and preservation of product behaviour. The final pass added explicit timer and PR treatment, measurable readability/touch targets, and hold/read-only/empty-history checks; it also removed wording that could imply an extra screenshot approval gate. Recommendations are labelled separately from source facts, and unresolved source tensions have defaults that allow useful work to proceed. This record documents review of the plan, not completion of the future implementation checks.

## Implemented choices

The rollout includes the currently working meals, courses and Neural Map screens as well as authentication, setup/profile, scorecard and training. Shared styling uses off-white primary buttons and neutral selected/completed surfaces. Olive appears only in small section icons and the active navigation marker. The text logo is retained; no proposed artwork or new photographs were introduced.

Instrument Serif Regular/Italic and Geist 400/500 are bundled as licensed, self-hosted WOFF2 fonts. Derived neutrals and their measured contrast are recorded in the evidence document. Browser review led to wrapping training tabs as whole controls, stacking the meal photo picker, expanding long numeric fields and clarifying incomplete Map/Focus indicators. Navigation scrolls normally in short viewports to keep focused actions visible at zoom. Product operations, SAM transitions and schema remain unchanged.
