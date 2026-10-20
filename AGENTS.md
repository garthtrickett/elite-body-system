# Project conventions

Read `PLAN.md` for scope and `docs/architecture.md` for operation contracts.
This repository is an unrelated project's boilerplate. Add product behavior only
when explicitly requested. Do not import Abby's domain, integrations, or settings.

- Use TypeScript functions and plain data. Do not define application classes.
  Instantiating a class required by an external library is allowed.
- Core operations accept named typed input objects and return `Result` with stable
  typed error codes. Validate external JSON; use `unknown` rather than `any`.
- Prefer immutable data: public records and arrays are readonly. Do not mutate
  inputs or shared application data. Local mutation in a private function/closure
  is allowed; adapters may mutate storage and other explicitly owned resources.
- Organize by vertical slice under `src/features`. A feature's server interface is
  `index.ts`; its browser interface is `browser.ts`. Other features and platform
  code import these entry points, never feature internals.
- Keep shared business rules authoritative in one place. Do not duplicate them
  across slices or create a general abstraction for a hypothetical future feature.
- Agent-native means every core operation has a typed, UI-independent interface
  and structured success/failure. HTTP and UI code adapt the same operations.
- Use lit-html templates and Tailwind. Avoid unsafe HTML insertion. Keep labels,
  keyboard access, focus feedback, loading feedback, and narrow screens working.
- Drive UI behavior through SAM: typed proposals enter one pure model acceptor;
  state representation derives renderable data; lit-html only renders and emits
  actions. The next-action predicate selects effects after acceptance. Network
  and navigation effects return correlated proposals; reject stale completions
  and dispatch each accepted effect once. Keep bearer secrets outside the model.
- PostgreSQL migrations define the schema. Kanel + kanel-kysely generate the
  Kysely types. Never hand-edit `src/platform/database/generated`.
- Do not log bearer tokens, session cookies, provider secrets, or database URLs.
  Provision accounts explicitly. Keep the local outbox loopback-only.

Run `bash scripts/with-postgres.sh npm run verify` for full isolated verification
(Docker and PostgreSQL client tools required). Run narrow checks first when
fixing a failure. CI also verifies generated schema types have no diff.
Do not bypass checks or weaken tests to obtain a pass.

Use the current host's shared-compute and job visibility conventions when working
on the operator's shared machine. Do not access unrelated `.env` files or databases.
