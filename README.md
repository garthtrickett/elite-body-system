# Elite Body System

Elite Body System uses TypeScript, PostgreSQL, Kysely, Kanel, SAM with lit-html,
Tailwind CSS, and email magic-link authentication. Harry’s client workflows are
ported as typed operations and safe browser views with account-scoped PostgreSQL
storage. No Abby product functionality or history is included.

## Client workflows

Sign in at `/` for the daily scorecard, real weight history, seven-day tracking,
L to R goals, and configurable nutrition/activity targets. Changes are saved to
the signed-in account; cross-tab revision conflicts require a reload rather than
overwriting another tab’s work. The client’s time zone determines today’s date.

The new `/onboarding` flow has eight sections: welcome, questionnaire, physical
audit, communication, measurements/photos, lifestyle, rhythm and call booking.
Set `ONBOARDING_ENABLED=true` only after content and integration acceptance:
everyone then needs `harry-v2` completion, including clients who finished legacy
setup. Confirmed Google Meet booking satisfies the call section. Private S3
assessment storage and a read-only Google Calendar adapter are configurable;
the actual scheduling service must provide verified account binding. See
[onboarding operations](docs/onboarding-operations.md), the
[implementation plan](docs/harry-onboarding-implementation-plan.md), and
[validation record](docs/onboarding-validation.md). Rollout defaults off.

While the new rollout is off, legacy Day 1 setup retains Harry’s 34-step flow: training schedule, equipment, story,
health answers, emergency contact, draft acknowledgement, starting weight,
identity and first daily priority. Drafts resume across devices. Profile allows
target changes and reviewing setup. Health flags hold training until the client
self-confirms doctor clearance. Screening and consent are explicitly **draft-v1**;
final approved wording is still needed.

`/training` follows the chosen four training days, two recovery days and rest day.
It supports exercise alternatives, instructions, set/weight/repetition logging,
notes, previous completed sessions, personal records, a stopwatch, deadline-based
rest timers, cardio and mobility. Finished sessions update the scorecard.
`?date=YYYY-MM-DD` opens a specific day; future days are read-only.

`/mindset/map` includes the full Neural Map teaching/build/read flow.
`/courses/mindset`, `/courses/nutrition` and `/courses/activity` include all twelve
lesson overviews/tasks, saved answers and server-enforced program-week unlocking.
Videos are configurable; unavailable media is labelled clearly.

`/meals` accepts descriptions and photos for OpenAI `gpt-6-luna` analysis.
Set the app’s own `OPENAI_API_KEY` server variable to enable analysis. Photos are
resized locally to at most 1600 pixels and 1 MiB each (four maximum), sent only
when analysing, and never stored in PostgreSQL. Requests set `store: false`.
Clients review estimated ingredients, edit portions/nutrients, then explicitly
log calories and protein to their scorecard. Unknown micronutrients stay unknown;
there is no claimed food database verification. Keyboard dictation can supply
spoken descriptions. Manual entry and reusable My Meals work without AI.
Meal logging/removal and daily totals are transactional, with idempotent retries.

The app follows Harry's [brand implementation plan](docs/brand/brand-implementation-plan.md):
self-hosted Instrument Serif and Geist, warm monochrome surfaces and restrained
olive details. Fonts and OFL licences are in `src/assets/fonts`. There is
no configured WhatsApp integration and no final video URLs yet.

## Configuring videos

Use a direct HTTPS video URL playable by the browser (not a YouTube watch page):

```sh
npm run content:video -- course:m1 https://media.example.com/lesson.mp4
npm run content:video -- exercise:wpullup https://media.example.com/pullup.mp4
npm run content:video -- course:m1 -
```

This trusted administrative command uses `DATABASE_URL`. There is no public media
write API. Keys are the IDs in `learning/courses.ts` and `training/catalog.ts`.

## Local setup

Requirements: Node **22.18+**, npm, and PostgreSQL 17+. Docker is convenient for
local development and the isolated verification script. That script also uses
the PostgreSQL `pg_isready` client command.

```sh
npm ci
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Put the generated value into `AUTH_RATE_KEY` in `.env`. Set `DATABASE_URL` to a
new local development database. For example, start an isolated local database
(choose a different host port if 5432 is occupied):

```sh
docker run --name elite-body-system-db --rm -d --memory=512m --cpus=1 \
  -p 127.0.0.1:5432:5432 -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=elite_body_system postgres:17-alpine
npm run db:migrate
npm run db:generate
npm run account:provision -- you@example.com
npm run dev
```

Open `http://127.0.0.1:3000/sign-in`. Request a link for the provisioned email.
With `EMAIL_MODE=outbox`, the message is a permission-restricted JSON file under
`.data/outbox/`. Open its `link` value and explicitly confirm sign-in. No real
email is sent in this mode. Stop the example database with
`docker stop elite-body-system-db`; its data is disposable.

`npm run dev` builds browser assets and starts Node's server watcher. After
browser template or CSS changes, run `npm run build` and reload the browser.
`npm start` serves the existing build. No global CLI packages are required.

## Database types

The database is the schema source of truth:

```sh
npm run db:migrate
npm run db:generate
npm run typecheck
```

Kanel introspects the migrated PostgreSQL schema. Its `kanel-kysely` hook renders
Kysely `ColumnType`, selectable/insertable/updateable types, and the `Database`
interface. The application imports that generated interface in its Kysely
connection and uses generated identifier types inside the PostgreSQL adapter.
Generated files are committed, never edited manually. CI regenerates them and
requires an empty diff. This follows the reusable configuration from Abby and
the [Kanel/Kysely integration](https://kristiandupont.github.io/kanel/kanel-kysely.html).

## Verification

```sh
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
bash scripts/with-postgres.sh npm run verify
git diff --exit-code -- src/platform/database/generated
git diff --check
```

The verification script owns a disposable PostgreSQL container, random loopback
port, and cleanup trap. Do not point the test suite at a development or production
database: integration tests truncate their isolated auth tables. `npm test` and
`npm run test:browser` require `DATABASE_URL` for a migrated test database.
They fail if it is missing instead of silently skipping database coverage.

CI runs migrations, real type generation, convention checks, strict typechecking,
the production build, PostgreSQL/HTTP tests, headless SAM tests, and Chromium tests. Browser evidence
includes desktop/mobile screenshots; traces are retained on failure. Install
Chromium system libraries with `npx playwright install --with-deps chromium`
on a fresh Linux machine if needed.

## Email delivery outside development

The included remote adapter uses [Resend's send-email interface](https://resend.com/docs/api-reference/emails/send-email)
via native `fetch`; there is no provider SDK. Configure the new project's own
verified sender and key:

```dotenv
NODE_ENV=production
PUBLIC_ORIGIN=https://your-new-project.example
EMAIL_MODE=resend
EMAIL_FROM=access@your-verified-domain.example
RESEND_API_KEY=your-own-key
```

Also set `DATABASE_URL`, a stable random `AUTH_RATE_KEY`, `HOST`, and `PORT` for
your environment. Put TLS in front of Node when using a reverse proxy. Outbox
mode is rejected in production or with non-loopback binding. The configured
origin controls emailed URLs and same-origin checks; it must match the browser's
origin exactly. Forwarded client headers are not trusted: rate limits use the
direct socket peer, so clients behind a proxy share its client budget.

External delivery requires your own configuration and a separate real-inbox check.

## Temporary Harry preview access

The operator requested an email-free preview shortcut. With
`AUTH_HARRY_PREVIEW=true`, entering `harrybaldwin` in the email field signs into
the single `harrybaldwin@preview.invalid` account. Provision it explicitly with:

```sh
npm run account:provision -- harrybaldwin@preview.invalid
```

Anyone who knows the alias can use that preview account while it is enabled.
It has ordinary client permissions and its own profile/data. Origin/CSRF checks,
rate limits, HttpOnly cookies, normal session expiry and sign-out still apply.
No email is sent. Normal email addresses continue through magic-link login.

The shortcut defaults off. Set `AUTH_HARRY_PREVIEW=false` and redeploy to disable
new shortcut logins and deny existing preview sessions. Set up Harry’s real email
account when the sending domain is ready.

## Railway deployment

The Docker image builds browser assets, removes development dependencies, and
runs Node 22 as an unprivileged user. Its explicit build context excludes local
environment files, outbox messages, test output, and Git history.

Create a Railway project with a PostgreSQL service named `Postgres` and an app
service built from this repository. Set these app variables in Railway:

```dotenv
DATABASE_URL=${{Postgres.DATABASE_URL}}
PUBLIC_ORIGIN=https://your-app.up.railway.app
AUTH_RATE_KEY=<64 random hexadecimal characters>
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
EMAIL_MODE=resend
EMAIL_FROM=onboarding@resend.dev
RESEND_API_KEY=<your own sending key>
OPENAI_API_KEY=<your own OpenAI key, optional for manual meals>
```

The public domain must target the configured `PORT` (3000 in this example). Set
`PUBLIC_ORIGIN` to the exact HTTPS domain visitors use. Keep secrets in Railway
variables, never in the repository or Docker build arguments.

Configure the app service in Railway with Dockerfile builds, pre-deploy command
`npm run db:migrate`, healthcheck path `/health` with a 60-second timeout, and
restart on failure with at most 3 retries. Use one app replica in the same region
as PostgreSQL. These service settings are stored in Railway; the Dockerfile is
versioned here. Railway's older `railway.json` format is being retired, so this
project does not depend on it.

The pre-deploy migration must succeed before a new deployment starts. The HTTP
check confirms the app can query PostgreSQL; it does not verify email
delivery. The app and database communicate over Railway's private network. A
database needs its own persistent volume.

For initial testing, `onboarding@resend.dev` can send only to the email address
associated with your Resend account. Provision that account explicitly after
migration, using `node scripts/provision-account.ts you@example.com` in the app
service. Use your own verified sending domain before admitting other recipients.
Production configuration deliberately rejects the local outbox mode.

Verify the same production image locally against an isolated test database:

```sh
docker build -t elite-body-system:local .
bash scripts/with-postgres.sh bash -c 'docker run --rm --network host -e DATABASE_URL elite-body-system:local node scripts/migrate.ts && docker run --rm --network host -e DATABASE_URL -i elite-body-system:local node --input-type=module < scripts/smoke-production.mjs'
```

The image smoke check uses fixture email configuration and sends no email. CI
runs it after the existing PostgreSQL and browser tests.

## Operations and architecture

[docs/architecture.md](docs/architecture.md) documents the callable interfaces,
retry semantics, auth lifecycle, feature layout, and limitations.
[docs/provenance.md](docs/provenance.md) records what came from Abby and what did not.
