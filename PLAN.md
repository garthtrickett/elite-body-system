# Elite Body System — extraction and implementation plan

## Saturday Body check-in

The uploaded EBS check-in supplies the client Body form: eight 1–10 ratings,
weight/waist/muscle measurements, Priority Movement (Unchanged/Improved),
wins and a rotating prompt. All visible answers and ratings are required on
completion; partial answers save automatically while clients fill in the form. The movement selection is saved per week
and shown first in Data and in history; older records without it display as not
recorded. Its own graph steps up for each Improved week and stays level for
Unchanged. The graph counts reported improvements in the displayed date range;
missing results stay absent rather than being counted as unchanged.
Selecting Improved reveals progressive-overload choices: more load moved
(strength), more reps (endurance), more control (technique) and more range
(mobility). Clients select one primary form before submitting an Improved result;
drafts may leave it unanswered. The selection is saved with the week and shown in
history. Selecting Unchanged hides and clears it. Older records with multiple
selections remain readable without inventing a primary choice.
Business is reserved for a future coach admin area. This increment is web only;
external WhatsApp delivery is deferred at the operator's request.

The opening box is titled “What went well this week? (Wins)”. Its placeholder asks
what went well, what improved and how the client feels/performs now. The separate
insight question is reserved for the Quarterly Check-In and is omitted from the
weekly form. Previously saved lesson answers remain readable in weekly history;
historical reflection answers remain under the Wins heading.

Measurement guidance asks for weight, waist and the priority muscle group after
Friday's workout, using the same scales and measuring sites each week. Weight is
a Friday measurement rather than a weekly average.

The check-in uses the platform's dark background, dark cards and light text,
matching the supplied colour reference. The form has no next-Saturday notice or
dashboard shortcut while filling in the form. Complete opens a Progress summary
with measurement and Priority Movement graphs, score averages, attention points
and optional score comparisons with a selected past check-in. Continue then opens
the dashboard. Past check-ins are accessed through the score-comparison selector;
there is no separate history section at the bottom. Earlier comparison choices
can be loaded from the same scores card. Progress is hidden while the current
form is unfinished. Progress graph and section titles
reuse the check-in title style, including its responsive font size.
Muscle Gain has a full-width graph of the priority muscle group measurement in
centimetres. Weight and Waist share a separate two-column row, stacking on phones.
The scores chart uses horizontal bars filled out of 10, with a second bar for a
selected past check-in and the numeric difference. Missing ratings remain absent.
The Score averages trend graph sits directly below the scores chart.
Separate cards use the page background as spacing; the Wins box is compact, rating
scales cover about half the desktop card, and the athlete heading is “Think like an
Athlete”. There is no question swap, visible “Your answer” label, autosave caption
or ratings-remaining caption. Automatic saving still operates. Data groups
Priority Movement and its conditional follow-up before a Friday measurements
subsection with aligned fields and compact guidance.

After setup, a full-screen check-in opens every Saturday at 09:00 in the client's
enrolled time zone. The current week must be submitted before dashboard or normal
workflow access is allowed. Automatic draft saving does not unlock the app.
The only submission button is “Complete”. An incomplete attempt shows “Fill out
this section then click complete to send it” in red beside each unfinished section
title, and keeps the client on the form. The reminders clear as sections are filled. PostgreSQL
stores separate dated records, server submission times and revisions; submitted
weeks remain readable, with progress charts, comparisons and paginated history.
The first requirement is the first Saturday on/after enrolment, without creating
historical requirements for weeks before this feature was enabled. New weeks are
determined by server time, including after restarts. Account/privacy access and
sign-out remain available. Verification and CI stay batched at session end.

## Performance Mentor check-in review

The coach-only area at `/mentor/check-ins` lists submitted, unreviewed check-ins
for explicitly assigned clients. The oldest is expanded initially. Buttons beside
the client name expand the full answers and open a private AI summary with “What
went well” and “Needs attention”. Mark reviewed saves the reviewer, submission
revision and server timestamp, removes the item from the queue and opens the next.
The original check-in stays in the client account and history without alteration.
The queue refreshes every 30 seconds and shows the next batch as reviews finish.

Coach access and client assignments are provisioned through `mentor:admin`, never
from public client input. OpenAI summaries use the existing server-only API key and
project model, are generated on request and cached per submitted record. Missing
provider configuration shows an explicit unavailable state; full answers and manual
review remain usable. This adds the check-in review area; in-app coach messaging is
not implemented by this increment.

## Quarterly Check-In requirements

The operator reserved “What Insight did you gain? (From error or success)” for a
Quarterly Check-In alongside progress photos, full-body measurements and body-fat
percentage. This records the requested quarterly scope; a separate quarterly
workflow has not been implemented in the weekly-check-in increment.

## Harry’s revised onboarding

Preferred name and time zone are collected in Account setup before the eight
onboarding sections. The welcome section contains the introduction, video and
Complete action; Complete records the welcome acknowledgement. Preparation
notices are omitted throughout onboarding. The Start Point introduction asks
for detailed, honest answers about the next 180 days.

The participation section contains three expandable paper-style forms: EBS's
readiness questionnaire, Informed Consent with emergency contacts, and the
Participation Agreement. Each has its own electronic acknowledgement, signature,
server timestamp and downloadable signed record. Physical assessments are grouped
with measurements. Our Weekly Rhythm uses clear icons, four-week Monday program
delivery, technique feedback and Sunday check-in deadlines, with WhatsApp access
shown separately. A mutual Trainer–Client Agreement follows it. Its proposed
four-week guarantee remains a draft until the operator specifies measurements and
the remedy. All new legal documents default to unapproved pending legal review;
no production rollout is authorised. Tests and CI remain batched at session end.

Health screening is first within Fitness Participation Agreement. A Yes answer requires
a short explanation and confirmation of medical clearance from a registered
physician before progressing beyond that section. Draft saving and prior-section
review remain available while blocked; trusted physical-assessment clearance is
separate from the client's declaration.

The operator authorized implementing the [eight-section onboarding plan](docs/harry-onboarding-implementation-plan.md). Confirmed decisions: all clients must complete the new flow, including clients who completed the old setup; a confirmed Google Meet booking satisfies the call section. Preserve existing program dates and history. The implementation uses a dedicated onboarding slice with versioned answers/content, private assessment media, booking confirmation and a rollout-controlled server gate. Approved videos/legal wording, the actual scheduling bridge and production storage/calendar configuration remain external launch dependencies. See [onboarding operations](docs/onboarding-operations.md) for configuration, review tools and release checks. Production rollout is not authorized by this implementation task.

## Active client-platform goal

The optional Media & Testimonial Release is requested after meaningful progress,
through a specific story invitation chosen by Harry. Onboarding contains no media
permission request. Media preferences in the account preserves withdrawal access.
Clients review the exact proposed results, testimonial and owned files, choose
channels (including paid ads separately), and explicitly approve that story.
Its own versioned approval and append-only permission history are independent of
participation consent and completion. Clients can withdraw after onboarding;
external campaign/post removal remains an operator action. The original release
stays an unapproved draft until the missing business/privacy disclosures and
relevant legal review are complete. See the onboarding operations guide for the
configuration and private history export commands.

The operator has now authorized completing onboarding/profile with per-client
PostgreSQL storage and configurable targets, training with logs/history/timers,
mindset and courses, and meal analysis as a separate integration. Harry’s archive
is the product reference. Final videos and approved screening/consent wording are
not available; media must remain configurable and the existing wording must be
identified as draft. The operator chose OpenAI GPT-6 Luna (`gpt-6-luna`) for
meal analysis, replacing the prototype’s Claude dependency. Credentials remain
server-only; the supplied EBS OpenAI key was configured in its Railway app
service without triggering a deployment.

Implemented locally: authenticated profile/daily-scorecard storage, the full
34-step setup and configurable targets, real scorecard history, training logs,
exercise instructions/alternatives/history/timers, Neural Map teaching/build/read,
all twelve course episodes with saved tasks and server unlocking, configurable
media, and an independent meal integration with review, manual entry, My Meals,
idempotent logging and transactional daily nutrition updates. Focused live Luna
checks passed for text and a synthetic food-label photo. Full isolated verification passed: 59 server/model tests and 16 Chromium tests,
plus the production Docker smoke check (migrations, unprivileged runtime, database
health, HTTPS cookies, assets and private paths). Exact-commit CI is also required
before merge. Final videos and approved wording remain explicitly unconfigured.

## Desktop client workspace

The desktop increment expands the existing client workflows with persistent
navigation, three visible progress cards, a three-pillar scorecard, workout
selection beside logging, course selection beside lessons/tasks, meal entry beside
saved meals and day history, and guidance beside Neural Map writing. Profile and
L to R dialogs use a wider, bounded layout. Phone navigation and the progress
carousel remain available below the desktop breakpoint. Account-panel links from
other workflows are consumed after a successful scorecard load.

Local acceptance: `bash scripts/with-postgres.sh npm run verify` passed with
65 server/model tests and 24 Chromium tests, including desktop saved edits,
account navigation, dialog focus, mobile reflow and 200% zoom. Generated schema
types have no diff. Desktop screenshots at 1024, 1440 and 1920px were inspected.
Production-image checks and exact-commit verification are also required in CI
before merging and deploying this increment.

## Desktop and mobile refinement

The full visual review covers all nine routes, every setup step and the main
empty, filled, locked, error, meal-review and video states. The accepted sweep
contains 236 states at 1440, 390, 1024 and 320px widths, with no page overflow or
browser errors. Refinements clarify empty scorecards and real weight history,
keep dialog navigation reachable, improve phone exercise selection and Focus,
and place desktop meal totals beside ingredients. Completed lesson answers wrap
fully. Local isolated verification passed 67 server/model tests and 29 Chromium
tests; generated schema types are unchanged. The [review evidence](docs/visual-refinement-review.md)
records the matrix, refinements, reproduction command and release requirements.

## Earlier scorecard increment (historical)

The initial sample scorecard port was merged and deployed before this client
platform goal. It used fictional Day 12 data and preview panels. The current
increment replaces those fixtures with durable per-account workflows. Coach
access, WhatsApp messaging, final course/exercise videos and approved consent
wording are outside this increment. The original extraction plan and evidence
are retained below as history.

## Goal and scope

Create a new GitHub repository, `garthtrickett/elite-body-system`, containing
only reusable foundations from Abby and the explicitly requested additions. This
is boilerplate for an unrelated project. Do not copy Abby history, configuration,
credentials, datasets, clinic concepts, integrations, deployment targets, or product
features. Leave the Abby and Gust working trees unchanged.

The repository was initially private as requested. On 20 October 2026, the
operator explicitly authorized making it public and retrying GitHub CI after
private Actions usage hit the account's included allowance. Public visibility is
now the requested final state; no payment or budget settings were changed.

The operator confirmed that the original notes mean Kanel + Kysely + lit-html.
The other requirements are typed errors, agent-native operations, immutability
where possible, functions and plain objects, no application classes, vertical
slices, email magic-link login, and Tailwind CSS. The operator additionally
requested SAM (State–Action–Model) composed with lit-html as in Abby.

## Extraction inventory

Source: `/home/gust/code/abby`, inspected at commit `5fa4fe4`.

| Source | Reuse | Adaptation |
| --- | --- | --- |
| `src/core/model.ts` | Discriminated `Result` and constructors only | Standalone shared module; no domain types |
| `src/shared/email-address.ts` | Conservative mailbox validation | Auth-owned module; documented normalization policy |
| `.kanelrc.cjs` | Kanel + `makeKyselyHook()` pipeline | Fresh schema and generated output, stable ESM imports |
| `tsconfig.json` | Strict native TypeScript conventions | New project paths; browser DOM types |
| `src/standalone/identity/*` | Security design, not class implementation | Function factory; general accounts; typed operations |
| `src/storage/postgres-magic-link-store.ts` | Atomic redemption, hashed tokens, database time, shared rate limits | New Kysely adapter; no clinic grants |
| `src/standalone/dashboard/sign-in-main.ts` | lit-html rendering and fragment handling | Fresh Tailwind UI and structured transport |
| `src/core/transition.ts`, `src/core/runtime.ts`, dashboard `view.ts` | Typed proposals, deterministic acceptance, effects outside acceptance, derived rendering | Function-based auth UI SAM loop; no call/domain model or controller classes |
| `scripts/with-postgres.sh` | Disposable, isolated database checks | No shared database; bounded local PostgreSQL process |

Do not extract voice, Twilio, Cliniko, LLM SDKs, patient models, billing, tenancy,
permissions frameworks, dashboards, queues, or portability machinery. Add no
fitness features or sample CRUD unrelated to validating the foundations.

## Proposed implementation

1. Establish a fresh Node 22.18+ / TypeScript ESM project with a lockfile. Use
   Kysely + pg, Kanel + kanel-kysely, lit-html, esbuild, Tailwind CLI, TypeScript,
   and Playwright. No application framework or application classes.
2. Create one real vertical slice, `src/features/auth`, with a public `index.ts`.
   Its typed operations request a link, inspect it before confirmation, redeem it,
   resolve a session, and sign out. Each accepts a named input object and returns
   `Result`; internal storage and delivery adapters are injected functions.
3. Keep infrastructure limited to configuration, database creation/migrations,
   HTTP composition, and build tooling. Shared code contains only general Result
   primitives. UI and programmatic callers use the same auth operations.
4. Use a new PostgreSQL schema containing accounts, challenges, sessions, and rate
   limits only. Run migrations before Kanel introspection. Check in real generated
   types and verify regeneration produces no diff. Generated files stay generated.
5. Implement email magic links with cryptographic random tokens, only digests in
   PostgreSQL, 10-minute link expiry, atomic single use, 30-minute idle and 8-hour
   absolute session expiry, hashed shared request budgets, and bounded delivery.
   GET never consumes a link. Fragment tokens are removed before network calls.
   Show the destination email before explicit confirmation. Use HttpOnly,
   SameSite cookies, Secure cookies on HTTPS, same-origin and CSRF checks, bounded
   JSON bodies, restrictive CSP, no-referrer, and no-store on auth responses.
6. Default account admission is explicit provisioning, not public registration.
   Provide a typed provisioning operation and CLI. Unknown and throttled email
   requests receive the same public acknowledgement. Local delivery writes to an
   ignored, permission-restricted outbox; production delivery uses a documented
   email adapter and requires explicit credentials. Do not send real email during
   implementation or tests, or access any existing `.env`.
7. Build a small accessible lit-html/Tailwind sign-in, confirmation, and signed-in
   shell. Include loading, success, invalid/expired-link, and retry states. Keep
   keyboard navigation, labels, focus styles, and narrow screens usable. Compose
   SAM with lit-html: actions produce typed proposals, a pure acceptor owns an
   immutable model, state representation derives the view, and a next-action
   predicate selects effects. Effect completions return as correlated proposals.
   Templates never mutate the model or perform network/navigation work. Keep
   bearer tokens outside the UI model and reject stale/duplicate completions.
8. Add concise `AGENTS.md` rules, an architecture explanation, operation contracts,
   environment example, local setup, source provenance, and automated enforcement
   for no classes, no feature-internal imports, and no shared-data mutation.
9. Validate typed failures, account admission, expiry, concurrent redemption,
   session invalidation, rate limits, delivery failures, origin/CSRF protection,
   the real browser flow, real PostgreSQL, generated-type reproducibility, build,
   and clean checkout setup. Publish a draft PR, wait for exact-head CI, fix
   defects, then mark ready and merge when green. Confirm the repo is private.

## Plan refinement log

- Pass 1: Mapped the user's list to an explicit extraction allowlist. Rejected a
  repository copy because it would bring unrelated product behavior and secrets.
- Pass 2: Reviewed auth against the function/plain-object requirement. Replace
  Abby's class/directory/clinic composition with a closure and explicit accounts.
  Preserve the security properties, not the source's domain structure.
- Pass 3: Reviewed operations for agent use and retries. Provisioning is idempotent;
  link requests acknowledge acceptance without promising delivery; redemption is
  intentionally single-use and concurrent retries must have one winner; session
  reads and sign-out have explicit contracts. Require database and browser tests.
- Pass 4: Implementation review found two practical issues to address before
  publication: use disposable Docker PostgreSQL because this host has client tools
  but no server binaries, and enforce feature boundaries for re-exports/dynamic
  imports as well as normal imports. Reuse CSRF cookies across tabs and keep them
  valid for the session lifetime; do not consume links while opening a page.
- Pass 5: Added the operator's SAM requirement before initial publication. Abby's
  call core owns deterministic transitions and external effects; its lit-html
  dashboard separates its view but uses mutable controller classes. Adapt these
  architectural ideas into one explicit function-based SAM/lit-html loop for the
  auth UI. Add headless transition/effect tests and retain real-browser coverage.
- Pass 6: Applied the operator's explicit public-visibility decision, checked the
  tracked files before publication, and retried both billing-blocked CI runs for
  the exact implementation head without changing or bypassing the checks.

## Acceptance evidence

- [x] New repository with independent Git history; public per the operator's update.
- [x] Extraction allowlist respected; no Abby runtime/product dependencies.
- [x] Kanel-generated Kysely types match a fresh migrated PostgreSQL schema.
- [x] Typed, callable core operations and structured errors, including provisioning.
- [x] Function-based vertical slice and enforced import/style rules.
- [x] Working email magic-link login and session lifecycle.
- [x] lit-html and built Tailwind UI verified in a real browser.
- [x] SAM/lit-html composition, including effect correlation and headless tests.
- [x] Local tests, build, and authoritative GitHub CI pass.
- [x] Documentation includes exact commands, limitations, and configuration needs.

Local evidence: clean `npm ci --no-fund --no-audit`, then
`bash scripts/with-postgres.sh npm run verify`: 24 Node integration/SAM tests and 4
Chromium tests passed, plus lint, strict typecheck, migrations, generation and
build. `git diff --exit-code -- src/platform/database/generated` and
`git diff --check` passed. Desktop/mobile screenshots were visually inspected.
GitHub evidence: implementation head `02e559b6d6aab700781219b46d1ec3cc8d171fe6`
passed both [pull-request CI](https://github.com/garthtrickett/elite-body-system/actions/runs/39343070514/attempts/2)
and [push CI](https://github.com/garthtrickett/elite-body-system/actions/runs/39343069038/attempts/2)
on retry after the authorized visibility change. The final documentation head is
also checked before merge; its exact-head runs are linked from PR #1.

## Original foundation limits (historical)

The original extraction phase created and verified boilerplate. Later increments
added the deployed scorecard and the client workflows described above. Sending real
email requires the new project's own sender configuration and credentials. Local
outbox delivery demonstrates the full flow without claiming external delivery.
Agent-native means the typed operations are callable without UI interaction; it
does not require an LLM integration, autonomous agent, or separate tool server.

## Management, sales and delivery portal — 28 October 2026

The sequential [management build sheet](docs/management-build-sheet.md) records the
operator's current scope and precedence. The supplied sales website is preserved
at `/apply`, except for the requested investment question without a price. EBS
Master contains Elite Marketing System, Elite Sales System and Elite Delivery.
Delivery includes the existing Member app and a Mentor workspace for messages,
community, progress, actual dated programme prescriptions and check-in reviews.
This supersedes the earlier increment's messaging limitation above. Group/community
and Individual memberships are explicitly assigned after confirmed enrolment.

The public funnel has a 30-day web guide after signup, application, bookable call
availability, ten FAQ/video slots and approved client stories after booking. The
private sales guide follows CLOSER with the operator's stated support options.
Marketing captures an owner's source, client angle, interview and proof, then
arranges those answers as a blog and video script. It provides voice transcription
when configured and illustrated Notion Markdown / branded HTML exports. No
invented client proof or automatic publishing is used.

Full verification, fixes and CI are batched before merging and Railway deployment.
Production master email, external media, provider credentials and a Notion
destination remain explicit configuration/content dependencies, not implied live
connections. See the [sales journey](docs/sales-journey.md),
[delivery guide](docs/delivery-portal.md) and [marketing guide](docs/marketing-workflow.md).
