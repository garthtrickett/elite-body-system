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
