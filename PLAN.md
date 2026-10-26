# Elite Body System — extraction and implementation plan

## Harry’s revised onboarding

Health screening is first within Fitness Participation Agreement. A Yes answer requires
a short explanation and confirmation of medical clearance from a registered
physician before progressing beyond that section. Draft saving and prior-section
review remain available while blocked; trusted physical-assessment clearance is
separate from the client's declaration.

The operator authorized implementing the [eight-section onboarding plan](docs/harry-onboarding-implementation-plan.md). Confirmed decisions: all clients must complete the new flow, including clients who completed the old setup; a confirmed Google Meet booking satisfies the call section. Preserve existing program dates and history. The implementation uses a dedicated onboarding slice with versioned answers/content, private assessment media, booking confirmation and a rollout-controlled server gate. Approved videos/legal wording, the actual scheduling bridge and production storage/calendar configuration remain external launch dependencies. See [onboarding operations](docs/onboarding-operations.md) for configuration, review tools and release checks. Production rollout is not authorized by this implementation task.

## Active client-platform goal

The requested optional Media & Testimonial Release lives in Fitness Participation
Agreement with separate choices for material, channels, identity and restrictions.
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
