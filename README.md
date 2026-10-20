# Elite Body System

Boilerplate for a new project: TypeScript, PostgreSQL, Kysely, Kanel, SAM with
lit-html, Tailwind CSS, and email magic-link authentication. No Abby product functionality
or history is included. The reviewed extraction scope is in [PLAN.md](PLAN.md).

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

No remote email has been sent or deployment provisioned as part of this scaffold.
External delivery requires your own configuration and a separate real-inbox check.

## Operations and architecture

[docs/architecture.md](docs/architecture.md) documents the callable interfaces,
retry semantics, auth lifecycle, feature layout, and limitations.
[docs/provenance.md](docs/provenance.md) records what came from Abby and what did not.
