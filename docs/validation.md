# Validation evidence

## Local checks — 19 October 2026

Passed from a clean dependency installation:

```sh
npm ci --no-fund --no-audit
bash scripts/with-postgres.sh npm run verify
git diff --exit-code -- src/platform/database/generated
git diff --check
```

`verify` runs, in order, `db:migrate`, `db:generate`, `lint`, `typecheck`, `build`,
`test`, and `test:browser`. Results: **24 Node tests passed, 4 Chromium tests
passed**, zero skips. All other commands passed. Desktop (1440×1000) and mobile
(390×844) screenshots were visually inspected. The convention guard also has
negative coverage for classes, explicit any, internal imports, re-exports and
dynamic imports; readonly contracts have negative compile-time examples.

Database tests use PostgreSQL 17 in a disposable Docker container, a random
loopback port, 512 MiB memory and one CPU. The local Node verification job used a
tracked systemd user scope capped at 2 GiB and two CPUs. No production database,
existing environment file, or real email provider was used.

An initial environment check found no PostgreSQL server binaries, so the helper
uses the installed Docker image and client tools. The first browser attempt found
the required Chromium revision missing. After installation completed, focused
browser checks and the complete clean-install verification passed. No test was
skipped or weakened.

SAM coverage includes immutable acceptance, explicit confirmation, correlated
effects, duplicate/stale result rejection, presentation before effect dispatch,
retry behavior, and disposal. The real browser caught a native fetch receiver
binding error during SAM integration; invoking the injected transport as a plain
function fixed it. The complete final verification then passed. Provisioning
through the CLI was also verified twice with the same resulting account ID.

## GitHub validation

Implementation head `02e559b6d6aab700781219b46d1ec3cc8d171fe6` passed both
[pull-request CI](https://github.com/garthtrickett/elite-body-system/actions/runs/39343070514/attempts/2)
and [push CI](https://github.com/garthtrickett/elite-body-system/actions/runs/39343069038/attempts/2)
on 20 October 2026. The workflow ran migrations, real Kanel introspection,
convention checks, strict typechecking, the production build, all 24 Node/SAM
tests, all 4 Chromium tests, generated-file reproducibility, and diff checks.

The first attempts could not start a runner for the private repository. The
operator explicitly authorized making this repository public; both unchanged-head
reruns then passed. No check was skipped or weakened, and no billing settings
were changed. The final documentation commit is checked again before merge;
its exact-head runs are linked from PR #1.

## Scope and remaining uncertainty

Only generic scaffolding and the requested authentication were implemented.
`PLAN.md` is the project's scope record; there are no Gust roadmap or registry
changes. Source groups are auth, shared Result, platform/database, build/validation
scripts, tests, and documentation. The source checkout of Abby stayed unchanged.

The full flow is verified using the local email outbox. Remote email requests have
stubbed provider tests, not real inbox-delivery evidence. Actual delivery requires
the new project's own sender and credentials. No deployment was requested or made.
