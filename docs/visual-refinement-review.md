# Desktop and mobile visual refinement

The review covers all nine page routes: sign-in, link confirmation, scorecard,
training, meals, Neural Map, and the three courses. It uses explicitly provisioned
fictional accounts in disposable PostgreSQL, with real browser rendering and
persistence. Live client records are not used as visual fixtures.

## Review matrix

| Area | States reviewed |
| --- | --- |
| Authentication | Email form, preview alias, link acknowledgement, valid confirmation, invalid/used-link recovery |
| Scorecard | Empty and populated values, all three progress cards, validation failure, failed save/retry, long Focus priority |
| Account dialogs | Profile, long story/targets/health sections, L to R, keyboard focus and close action after scrolling |
| Setup | All 34 steps, health follow-up, consent acknowledgements, selected choices, stable desktop continuation controls |
| Training | Seven scheduled days, Log/Instructions/History tabs, recorded history, rest timer, clearance/setup holds, load failure and retry, video player |
| Learning | All twelve lessons, locked and completed lists, complete answers, seven Map builder steps, Map reading, load failure and retry, video player |
| Meals | Empty and populated history/My Meals, manual review, multiple ingredients, expanded micronutrients, photo capture, deterministic AI review, load failure |
| Responsive edges | Every signed-in route at 320px and 1024px; long profile, screening and consent dialogs, meal review, and sign-in |

Primary viewports are 1440×1000 and 390×844. Edge viewports are 1024×768 and
320×700. Existing browser checks also exercise 200% viewport reflow and font
failure. These are emulated Chromium views, not a claim of physical-device testing.

## Refinement loop

The baseline captured 192 screens. The first refinement pass expanded this to
206, and the next added narrow-screen edge cases for 230. Video states brought
the subsequent pass to 234. The accepted pass contains 236 states, including
the focused setup name field at both primary sizes. Contact sheets are reviewed across the matrix; full-resolution views
are used for long forms, dialogs, meal review, and identified defects.

| Before | After | Reason |
| --- | --- | --- |
| Target numbers appeared inside empty scorecard fields | Empty entries show a dash; targets remain separate | Clarify recorded values versus goals |
| Missing weight history showed 0 kg and a marker | Explicit empty guidance; no invented chart | Show only actual weight data |
| Trend points were equally spaced regardless of date | Positions and captions use recorded dates and the starting weight | Represent gaps and the most recent weigh-in accurately |
| Short desktop dialogs stretched to the viewport | Content-sized dialogs and a stable setup frame | Remove excess space and keep repeated controls steady |
| Long forms lost their close action on scroll | Persistent dialog header and a bounded setup editor | Keep navigation and keyboard focus reachable |
| Workout selection filled most of a phone screen | Independently scrollable exercise cards | Bring the active exercise closer to the top |
| Incomplete sets also displayed ticks | Open circle before completion; tick and highlighted row after | Make completion unambiguous |
| A long priority stretched three narrow mindset tiles | Two small cards and a wider Focus row on phones | Keep the priority readable without clipping |
| Meal totals and logging followed a long ingredient form | Desktop review summary beside ingredients; sequential phone flow | Review portions and totals together |
| Completed lesson answers were clipped in textareas | Fully wrapping saved-answer cards | Make completed lessons readable |
| Some text actions had small tap areas | Explicit action sizing and clearer target units | Improve phone use and form clarity |
| Failed loads could retain loading/saved copy | Clear failure and retry states | Keep feedback truthful |

Local acceptance passed `bash scripts/with-postgres.sh npm run verify`: 67
server/model tests and 29 Chromium tests, plus conventions, strict typechecking,
migrations, generated-type comparison and build. The accepted screenshot manifest
records no horizontal page overflow, browser errors or undersized enabled controls
under its 40px-height check. Contact sheets and targeted full-resolution views
were inspected. Exact-commit CI with the production-image smoke check and a live
Railway check are required before release completion; results are recorded in the
pull request.

## Reproduce the screenshots

With Docker, PostgreSQL client tools, Chromium and ffmpeg installed:

```sh
bash scripts/with-postgres.sh npm run audit:visual -- review
```

The command migrates/builds and writes screenshots plus a geometry/browser-error
manifest under `.data/visual-audit/review/`. The runner refuses a database that
does not match a live container labelled by the disposable PostgreSQL wrapper.
It generates a small local video fixture and intercepts provider/media requests;
it sends no real email or meal-analysis request. Screenshots and fixtures are
ignored and excluded from the production image.

Final exercise/course videos and approved screening/consent wording remain pending.
The visual review preserves those explicit draft/unconfigured states. It changes
no account-admission rules, schema, targets, or lesson-unlocking rules.

## Follow-up: 24 live-app audit findings

This increment addresses the subsequent live audit of release `5561db7`.
Numbers below match the operator's accepted 24-item report. The shared mobile
workspace now gives scrolling content, optional meal actions, and navigation
separate viewport rows. Navigation never floats over client controls. Desktop
retains the sidebar and normal document scrolling.

| # | Before | After | Why |
| --- | --- | --- | --- |
| 1 | Bottom navigation intercepted visible controls | Separate navigation row below the clipped scrolling region | Keep visible actions tappable |
| 2 | Zero weight change had a down arrow | Neutral “No change” | Report direction accurately |
| 3 | Goal completion replaced units and targets | Persistent kcal/h labels and target copy, separate completion message | Preserve metric meaning |
| 4 | Desktop sign-in repeated the logo | Mobile-only logo respects its responsive visibility | Restore intended composition |
| 5 | Narrow tile errors stacked outlines and borders | One field underline, tile border and unbordered message | Make validation readable |
| 6 | Expired rest retained a large timer card | Compact completed-rest status | Keep the next set near the top |
| 7 | Secondary mobile routes lost navigation | Shared navigation and More links on all workspace routes | Keep other daily tasks reachable |
| 8 | One weigh-in showed a dot and duplicated endpoints | Actual first weight and guidance to add another sample | Explain why a trend is unavailable |
| 9 | Repeated day initials lacked dates | Date labels with today distinguished | Identify each tracking day |
| 10 | Tracking marks and percentage lacked explanation | None/partial/all legend and entries out of 63 | Explain the visual encoding |
| 11 | Weight and kg were separated by excess field width | Weight field follows entry length | Group value and unit |
| 12 | Empty inputs looked like passive missing data | “Add” placeholder and entry hint | Make editing discoverable |
| 13 | Openable tiles looked static | Explicit Open/Read cues | Distinguish actions from information |
| 14 | Completion used a tiny circle glyph | Visible 24px checkbox within the existing 44px button | Make completion controls recognisable |
| 15 | Exercise strip had no position or navigation cue | Exercise count and previous/next controls | Expose the whole workout |
| 16 | Laptop progress consumed two rows | Compact three-card row at intermediate desktop widths | Bring daily entries into view |
| 17 | Course waiting screens used generic filler | Named next lesson, unlock week/current week and practical action | Give the waiting state purpose |
| 18 | Whole disabled lesson cards were dimmed | Readable unlock status with a muted title | Keep availability information legible |
| 19 | Profile targets followed the plan summary | Targets first in reading and keyboard order | Prioritise common edits |
| 20 | Setup only showed a small step count | Named sections, current section and progress bar | Make the long journey understandable |
| 21 | Dialog close used the same chevron as previous-step navigation | Explicit close icon/name; setup Back remains distinct | Separate exit from previous step |
| 22 | Meal headings and actions used raw ISO dates | Human-readable calendar dates | Keep date presentation readable |
| 23 | Photo upload exposed the native chooser row | Branded label, keyboard focus and selected-photo count | Finish the upload presentation |
| 24 | Mobile meal totals and log action followed the long form | Persistent compact totals/log row and optional notes section | Keep the result and action available while editing |

The new browser regression file is `test/browser/audit-fixes.spec.ts`. It uses
fictional accounts and the disposable database, including a real expired rest
timer, a first-day weigh-in and saved nutrition. It checks action hit testing at
320×568, 390×844 and 768×1024; navigation across secondary routes; first-weight
and tracking states; exercise navigation; profile/setup hierarchy; compact laptop
entry placement; sign-in branding; locked course readability; and mobile meal
logging geometry. Existing chart fixtures now contain multiple actual dated
weights, so graph assertions remain meaningful.

The screenshot runner also captures the mobile scroll region's end and adds
768×1024 tablet and 844×390 landscape views. Local isolated verification passed 67 server/model and 35 Chromium tests,
including conventions, strict typechecking, build, migrations and schema type
generation with no generated-file diff. Exact-commit CI, screenshot acceptance
and live deployment results are recorded in the release pull request.

The follow-up screenshot review also found that the added setup progress area
left too little editor space in short landscape dialogs. Below 600px height at
wide widths, setup now scrolls as one dialog with its close header retained.
A dedicated 844×390 long-health-form check covers both ends of that dialog.
The preview-login tests close their browser page before stopping their owned
HTTP server, fixing a CI teardown hang without changing login assertions.

## Independent review follow-up: 11 findings

The operator requested implementing all findings from the second, independent
live audit of `042feff`, then merging and deploying the result. This increment
keeps the existing data schema and provider contracts. Meal review feedback uses
the same numeric limits as server parsing; navigation confirmation is a correlated
SAM effect, and DOM focus/scroll effects follow accepted state.

| # | Before | After | Why |
| --- | --- | --- | --- |
| 1 | Meal navigation silently discarded unfinished work | Explicit discard confirmation for workspace/back links, plus browser Back/refresh protection | Let users cancel departure and retain the exact draft |
| 2 | Invalid meal values lacked nearby feedback and Log stayed available | Named, described inline errors; correction status in the persistent summary; Log disabled until valid | Identify the problem without losing the input |
| 3 | Review inherited capture's scroll offset | Focus and reveal the review heading once on entry | Establish the new state and meal name without moving users during edits |
| 4 | Exercise arrows left the selected card outside its strip | Reveal the accepted selection horizontally without vertical page movement | Keep list and detail connected, including under reduced motion |
| 5 | Mobile locked courses omitted the next step | Reuse the next-lesson explanation and action after the mobile course heading | Offer the same useful guidance on phones and tablets |
| 6 | More destinations had no visible active location | Active More indicator and highlighted current destination | Preserve navigation context in both states |
| 7 | More overlay required manually toggling its trigger | Native automatic popover with Escape and outside dismissal | Provide predictable keyboard and pointer dismissal |
| 8 | Landscape footer/navigation consumed 130px | Compact short-height controls and review header | Leave at least 286px for a 390px-high task viewport |
| 9 | Mobile repeated full totals and persistent totals | Concise persistent energy/protein; optional remaining nutrient breakdown | Retain detail without duplicate primary totals |
| 10 | Sign out looked like the primary task action | Separate, compact secondary action | Reduce exit prominence relative to saving |
| 11 | Map teaching prose spanned long card lines | Paragraph measure capped at 65ch inside the existing layout | Keep explanatory reading comfortable |

`test/independent-fixes-sam.test.ts` checks numeric feedback, draft retention,
correlated navigation decisions, unsafe destinations and uncertain-write guards.
`test/browser/independent-fixes.spec.ts` exercises real discard/cancel decisions,
browser Back, meal validation/recovery, review entry focus, carousel geometry,
More state/dismissal, mobile locked courses, short landscape space, secondary
sign-out and the rendered prose measure. Existing logging/retry tests still verify
that saved meal totals and idempotency survive the UI changes.

Local full isolated verification passed 69 server/model tests and 42 Chromium
tests, with conventions, strict typechecking, build, migrations and generated
schema types unchanged. The broad screenshot sweep and exact-commit CI remain
release gates; final deployment and live acceptance evidence are recorded in the
pull request.

## Paseo audit follow-up: 13 findings (21 October 2026)

This increment addresses the thirteen reproducible defects in the independent
Paseo report. Authenticated reproductions use disposable accounts and the real
local API; induced failures are intercepted locally. Production client data is
not used as a test fixture.

| # | Before | After | Why |
| --- | --- | --- | --- |
| 1 | A new date could remain beside an editable old workout after a failed load | Hide stale controls while loading; restore the loaded date on failure; Retry requests the failed date | Keep the date and edited workout consistent |
| 2 | Landscape setup retained the previous step's scroll | Reset dialog/editor scroll and focus step progress after accepted step changes | Reveal the new fields below the sticky header |
| 3 | Opening lower lessons skipped the title and overview | Focus and reveal the lesson's beginning on selection | Establish the new lesson and its back action |
| 4 | Map steps inherited the previous explanation's offset | Reveal the new title once per accepted step change | Preserve context without moving users during edits |
| 5 | Invalid daily targets produced a distant generic error | Shared server/client bounds, described inline errors, correction summary beside Save, focus first invalid target | Identify the value and permitted range |
| 6 | Invalid reps inserted a distant page-level error | Keep raw text, mark the specific set field, show its range nearby and retain focus in view | Make correction possible without a page jump |
| 7 | Scorecard save failures appeared above the visible tile | Reserved phone feedback row, sticky desktop feedback and unsaved-day labels; retain the focused input in view | Distinguish local goal results from saved data and expose Retry |
| 8 | Started rest remained above the viewport while Start rest looked inactive | Reserved mobile countdown/actions row; running feedback beside desktop sets; show Start only when rest is inactive | Expose the timer without covering the editable task |
| 9 | Long meal history pulled desktop review totals and Log off-screen | Stick the summary independently beside the editor, with history below the review | Keep current totals and action independent of history length |
| 10 | Add ingredient left focus after the inserted fields | Focus and reveal the added ingredient name; Tab continues through its fields | Follow the user's keyboard intent |
| 11 | Incomplete lesson submission appeared to do nothing | Identify missing answers, focus the first, and place the completion error beside the action | Explain rejection at the task form |
| 12 | Read-only future workouts offered a no-op Swap | Disable Swap consistently with future logging controls | Match visible availability to permitted actions |
| 13 | Completed courses promised editable, autosaved tasks | Describe reviewing completed lessons and saved answers | Match guidance to read-only completion state |

`test/browser/audit-13-fixes.spec.ts` reproduces these states at 320×568,
390×844, 844×390, 1024×768 and 1440×900. It covers loading/failure/retry,
accepted transitions, correction/recovery, keyboard focus, timer visibility,
long meal history and truthful completed-course copy. Headless tests additionally
cover stale date completions, edits rejected during date loads, shared target
bounds and incremental missing-answer correction. Existing save/persistence
and provider tests remain required.

Final local acceptance passed `bash scripts/with-postgres.sh npm run verify`:
72 server/model tests and 51 Chromium browser tests, including lint, strict
typechecking, build, migrations and schema generation with no generated-type diff.
The final broad sweep captured 260 states across desktop, laptop, phone, narrow
phone, tablet and landscape, with zero browser errors, horizontal page overflow
or enabled controls below its 40px check. Twenty-eight targeted screenshots cover
the reproduced transitions, failures and corrections. Evidence is retained locally
under `.data/thirteen-fixes-acceptance/` and
`.data/visual-audit/thirteen-fixes-20261021/`. These are emulated browser checks;
physical devices and Safari were not tested in this increment.
