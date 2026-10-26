# Harry's local editing preview

This preview serves `/home/gust/code/elite-body-system-legacy` using an isolated
PostgreSQL database. Changes in this checkout rebuild browser JavaScript and CSS;
Node restarts for server changes. Refresh the page after an update. There is no
automatic browser reload, which could discard an unfinished form.

Enter `harrybaldwin` in the sign-in email field. This is the existing shared
preview account, with ordinary client permissions. Use synthetic data only.
The eight-section setup is at `/onboarding`; the rollout gate is disabled so
Harry can also explore the other app pages. Videos, legal approval, uploads,
calendar booking and external meal analysis require their normal provider
configuration and remain unavailable when not configured.

The initial dashboard profile is a synthetic completed client so Harry can
explore the app and Setup opens the revised onboarding. Its onboarding record
and legal acceptance remain incomplete; no approval or medical clearance was
invented. The private `seed.mjs` creates that profile only if none exists and
does not reset later edits.

## Services and private state

Use `work ls` to find the three persistent jobs:

- `EBS Harry persistent preview PostgreSQL; loopback 55432, 512MiB 1CPU`
- `EBS Harry preview app and browser/CSS watchers; loopback 3010, 1GiB 1.5CPU`
- `EBS Harry preview ngrok HTTPS tunnel to loopback 3010; 128MiB 0.25CPU`

They run in bounded user systemd scopes so restarting Paseo does not kill them.
They are session services, not boot-time units. Inspect the board/logs after a
host reboot and restart deliberately. Never run a second copy on the same ports.

Private state is `/home/gust/.local/state/ebs-preview` (directory 0700, environment
files 0600). `db.sh` starts the named `ebs-harry-preview-db` container; its volume
is `ebs-harry-preview-postgres`. `app.sh` loads `preview.env`, migrates and
explicitly provisions the shared account, then runs `npm run dev:preview`.
Do not print those environment files or copy production data/secrets into them.
PostgreSQL is published only on loopback and retains its volume across restarts.

Ngrok uses the existing authenticated config, with request inspection disabled.
Get the current public URL from `http://127.0.0.1:4040/api/tunnels`, then ensure
`PUBLIC_ORIGIN` in the private environment is that exact HTTPS origin. Restart
the app after changing it. A restarted free tunnel may have a different URL;
verify it and send Harry the replacement link. Never expose the database,
development outbox, inspector or filesystem.

`EMAIL_MODE=disabled` permits the HTTPS tunnel without external email credentials
or an exposed local outbox. It is accepted only outside production, with
`AUTH_HARRY_PREVIEW=true` and a loopback app binding. Normal email sign-ins cannot
deliver links in this mode. Secure cookies and exact-origin/CSRF checks remain.

## Editing and session completion

Harry requests edits in the coding chat; the website itself is the review preview.
Apply edits in the served checkout and let its watchers rebuild. Do not run tests
or push to trigger CI for every edit. At the end of his session, batch the full
isolated verification and fixes, then run exact-head CI before merging. An
isolated verification checkout prevents its build and browser fixtures from
overwriting the live preview's assets or data. Never run fixture tests against
the persistent preview database.

For a manual restart, use `work run` with the matching label and bounded scope,
as required by the shared host conventions. Stop the existing scope first and
check that the port has closed; preserve the database volume and private state.
