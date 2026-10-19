# Elite Body System — extraction and implementation plan

## Goal and scope

Create a new private GitHub repository, `garthtrickett/elite-body-system`, containing
only reusable foundations from Abby and the explicitly requested additions. This
is boilerplate for an unrelated project. Do not copy Abby history, configuration,
credentials, datasets, clinic concepts, integrations, deployment targets, or product
features. Leave the Abby and Gust working trees unchanged.

The operator confirmed that the original notes mean Kanel + Kysely + lit-html.
The other requirements are typed errors, agent-native operations, immutability
where possible, functions and plain objects, no application classes, vertical
slices, email magic-link login, and Tailwind CSS.

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
   keyboard navigation, labels, focus styles, and narrow screens usable.
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

## Acceptance evidence (fill during implementation)

- [ ] New private repository and independent Git history.
- [ ] Extraction allowlist respected; no Abby runtime/product dependencies.
- [ ] Kanel-generated Kysely types match a fresh migrated PostgreSQL schema.
- [ ] Typed, callable core operations and structured errors, including provisioning.
- [ ] Function-based vertical slice and enforced import/style rules.
- [ ] Working email magic-link login and session lifecycle.
- [ ] lit-html and built Tailwind UI verified in a real browser.
- [ ] Local tests, build, and authoritative GitHub CI pass.
- [ ] Documentation includes exact commands, limitations, and configuration needs.

## Known limits

This work creates and verifies boilerplate, not a deployed product. Sending real
email requires the new project's own sender configuration and credentials. Local
outbox delivery demonstrates the full flow without claiming external delivery.
Agent-native means the typed operations are callable without UI interaction; it
does not require an LLM integration, autonomous agent, or separate tool server.
