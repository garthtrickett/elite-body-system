# Harry’s onboarding: operation and rollout

The new flow is `harry-v2`. The operator confirmed that all clients must complete it, including clients who finished legacy setup. A confirmed Google Meet booking completes the call requirement; attendance is not required for dashboard access. Existing program dates, profile answers, consent history and scorecards are preserved.

## Configuration and rollout

`ONBOARDING_ENABLED=false` is the rollout default. The new `/onboarding` route and APIs can be verified before switching existing clients over. With `ONBOARDING_ENABLED=true`, every normal client page redirects incomplete accounts to onboarding and normal client APIs return `forbidden` with reason `onboarding_required`. Auth, sign-out, onboarding and health/assets remain available. Legacy `profile.completed` cannot satisfy this gate.

Do not enable the production gate until Harry’s approved content, private media provider and actual booking confirmation have passed acceptance. Missing content/integrations are shown explicitly; they do not count as completed steps. No production settings have been changed by this implementation.


## Draft saving and section navigation

Questionnaire text and goal ranking autosave after a 600 ms pause. Background
saves leave the fields editable. Save responses reconcile against the answers
actually sent, retaining newer typing and ranking changes. Raw spaces remain in
the active answer while saved status uses server-normalized values. An uncertain
save also retains explicit reversions during recovery, while untouched fields
can accept other-tab updates. A pending save remains
protected against page unload. Other sections retain explicit Save progress and
Save and continue controls.

Save and continue saves the latest draft and moves to the next section in the
eight-section order. It can be requested during a background save; the current
section stays visible until any newer answers are also saved. Failed saves retain
the draft and section. Reload saved progress reconciles local edits with the
server before saving resumes. This uses the existing account storage and revision
checks, with no browser storage of assessment answers.

Section navigation is independent of completion eligibility. Clients may advance
past incomplete answers, evidence or unconfigured guidance and return later. The
ready counter continues to reflect actual requirements. Finish onboarding and the
server gate still require every section, finalized evidence and a confirmed
booking.

| Before | After | Why |
| --- | --- | --- |
| Questionnaire changes needed an explicit save. | Text and goal order save after a short pause, with saving/saved feedback and editable fields during background saves. | Clients can write without repeatedly pressing Save. |
| Continue stayed on a section when requirements or Harry’s content were missing. | Continue saves and advances through the eight-section list; final completion still enforces every requirement. | Moving through the form and unlocking the dashboard are distinct actions. |
| A save froze all fields and could not accept a newer draft. | Older responses retain newer answers; Continue flushes the latest draft before advancing. | A slow connection must not discard input or move on with an older answer. |

## Approved content

Use the trusted CLI with the app’s own environment:

```sh
npm run onboarding:admin -- configure /private/path/onboarding-content.json
```

Start from `docs/onboarding-content.example.json`; its empty content is deliberately unapproved. The validated content object is defined by `OnboardingContent` in `src/features/onboarding/data.ts`. Supply a unique `version`, `approved`, welcome text/video, communication text and HTTPS contact link, versioned informed consent and seven approved PAR-Q questions, mobility test IDs/instructions/videos, strength/cardio/measurement videos and protocols, technique/weekly rhythm text and an HTTPS booking URL. A mobility entry has `id`, `label`, `instructions` and an HTTPS `videoUrl`. Never mark sample documents approved for clients.

Mobility IDs become stable submission slots. Limb fields use centimetres and body weight uses kilograms. Confirm the “ham/thigh” location and Harry’s test protocols in the approved guidance. Form bounds are broad input checks, not clinical reference ranges. The client questionnaire consists of seven text answers and one seven-goal ranking question.

Content is archived by immutable version. Changing a version’s existing contents is rejected. Use a new version for changed instructions/documents; unfinished clients must acknowledge the new content and submit media against its protocol version. Completed clients retain their original version and completion record. This is intentionally separate from the existing exercise/course video registry: approval and assessment evidence must refer to one immutable onboarding content package, rather than independently mutable video keys.

## Private S3-compatible storage

The operator selected Railway-hosted S3-compatible storage on 22 October 2026. Use a private Railway Bucket in the existing project; see [Railway's bucket guide](https://docs.railway.com/guides/storage-buckets-guide). Provisioning is pending: the machine's Railway CLI login currently reports an expired grant. No bucket or production variables were changed.

Create the bucket in Railway, then reference its Credentials-tab endpoint, region, bucket name and keys in the five application variables below. Keep keys in Railway variables, never repository content or chat. For a new Railway bucket set `ASSESSMENT_S3_FORCE_PATH_STYLE=false`: Railway uses virtual-hosted bucket URLs. The application scopes its upload CSP to that exact bucket origin. Leave the option true for older path-style buckets or compatible providers that require it. Configure upload CORS for the exact application origin and test the real provider before enabling onboarding. [Railway documents both URL styles](https://docs.railway.com/storage-buckets).

Configure all five values together, server-side:

```text
ASSESSMENT_S3_ENDPOINT=https://your-s3-compatible-endpoint
ASSESSMENT_S3_REGION=your-region
ASSESSMENT_S3_BUCKET=your-private-bucket
ASSESSMENT_S3_ACCESS_KEY_ID=server-only
ASSESSMENT_S3_SECRET_ACCESS_KEY=server-only
```

Use a private bucket, least-privilege credentials scoped to the `onboarding/` prefix, encryption at rest, and CORS allowing the app’s exact origin to PUT the signed upload with `Content-Type`. Test the chosen provider’s signed Content-Length behavior, copy preconditions, range reads and deletion. Only the configured upload origin is added to the onboarding page’s connection policy.

Uploads use opaque account-owned keys and ten-minute upload authorization. Images accept JPEG/PNG/WebP up to 12 MiB; videos accept MP4/MOV/WebM up to 250 MiB. Finalization checks stored size/type, copies the pending object to a separate ready key using its ETag, validates its signature and removes the pending object. Reusing a pending upload authorization cannot overwrite the finalized submission. This validates basic media container signatures; it is not a claim of full decoding, transcoding or malware scanning. Agree the provider’s processing/scanning policy before accepting real client files.

Ready files receive two-minute signed download URLs, with attachment disposition and private/no-store caching. Signed URLs and credentials stay out of SAM state and logs. Files are never sent to meal analysis or an AI provider. The shared Harry preview account cannot submit real assessment media.

The UI supports progress, cancellation, retry by selecting the file again, removal and replacement. A replacement does not invalidate the prior ready submission until the new file is verified. A closed mobile browser does not continue uploading in the background. Pending uploads expire after 24 hours.

Run bounded cleanup through the job board:

```sh
work run "EBS expired assessment cleanup" -- npm run onboarding:admin -- cleanup
work wait "EBS expired assessment cleanup"
```

Cleanup removes expired pending objects, old unreferenced objects (including after account deletion), and deleted/replaced objects. It retains referenced ready files. Agree a retention duration with Harry before launch; no arbitrary automatic expiry of active client assessments is assumed. Client removal after completion removes media without silently relocking the dashboard; minimal historical completion/consent evidence remains subject to the agreed policy.

## Google Meet booking confirmation

The first adapter reads Google Calendar using server-side OAuth credentials:

```text
ONBOARDING_GOOGLE_CALENDAR_ID=Harrys-calendar-id
ONBOARDING_GOOGLE_CLIENT_ID=server-only
ONBOARDING_GOOGLE_CLIENT_SECRET=server-only
ONBOARDING_GOOGLE_REFRESH_TOKEN=server-only
```

Use an appropriate read-only Calendar scope. The scheduling service must create a confirmed event with a start time, a Google Meet link, and the private extended property `ebsAccountId` set to the authenticated EBS account ID through a trusted integration. Email matching or a browser return parameter does not establish ownership. Google’s [events list API](https://developers.google.com/workspace/calendar/api/v3/reference/events/list) supports filtering by private extended property, and its [events get API](https://developers.google.com/workspace/calendar/api/v3/reference/events/get) retrieves previously linked events for reconciliation.

The operator confirmed Google Calendar on 22 October 2026. Harry does not have a booking page yet and will create one later; the operator requested preparing everything possible without it. Keep `bookingUrl` empty until that page exists, and retain the visible not-configured state. An authorized Calendar connection is also pending. A Google appointment-schedule link alone does not populate the EBS account binding; a trusted bridge still needs configuring or adapting before end-to-end automatic confirmation can be claimed. No Google account has been connected by this code change.

The operator also confirmed that final onboarding videos and approved consent/PAR-Q documents do not exist yet. Keep those content fields unapproved and onboarding rollout disabled until supplied; do not substitute draft legal copy or make missing evidence count as completion.

“Refresh confirmation” reads the provider, then updates the owned appointment record. Completion checks the provider again when configured. Duplicate/older versions of the same event are ignored. Cancelled appointments block unfinished onboarding; cancellation after completion does not automatically relock the app. Time is displayed in the client’s time zone. When the old event is cancelled, the adapter searches for one account-bound replacement; a compare-and-swap binding prevents stale requests from restoring the old appointment. Multiple active appointments require Harry to resolve the ambiguity.

Trusted reconciliation can also be run without exposing provider secrets or the Meet URL in terminal output:

```sh
npm run onboarding:admin -- sync-booking ACCOUNT_ID
```

## Harry’s review and assessment exceptions

There is no new public coach role or client-controlled waiver endpoint. A trusted operator can export an account’s answers/evidence to a new mode-0600 file:

```sh
npm run onboarding:admin -- review ACCOUNT_ID /private/path/review.json
```

For an approved assessment alternative, create a private JSON file containing `requirement`, `reason`, and `resolvedBy`, then:

```sh
npm run onboarding:admin -- resolve ACCOUNT_ID /private/path/resolution.json
```

Allowed requirements are physical-audit slot IDs, `health-clearance`, or `health-audit-alternative`. Photo requirements cannot be waived. `health-audit-alternative` allows a documented audit exception without granting permission to train; affected physical slots still need explicit resolution. `health-clearance` records authorized clearance and can also update the training restriction after completed onboarding. Both are tied to current health answers/details and content version, so changed health answers invalidate prior authorization. The existing client checkbox cannot grant clearance.

To download a ready assessment for review, create a private JSON file with `mediaId` from the review export and a new `outputPath`, then run `npm run onboarding:admin -- download ACCOUNT_ID DETAILS.json`. The tool checks ownership, streams to a mode-0600 file and does not print signed URLs. Harry’s access to these trusted tools must be operationally verified before launch. No coach portal, WhatsApp automation or video editor is implied.

## Acceptance and rollback

Use isolated PostgreSQL with `bash scripts/with-postgres.sh npm run verify`. Additional tests cover ranked goals, legacy relocking, account-scoped media, pending/invalid uploads, failed replacements, health alternatives, booking cancellation/replays, transactionally initialized scorecards and mobile layouts. Provider tests use fixtures unless explicitly run against the configured S3/Google services; distinguish those from live integration verification.

Before production enablement: approve all content/protocols; verify real upload/download/removal and CORS; verify Google account binding, scheduling, rescheduling/cancellation and Meet details; verify Harry’s review path; rehearse migration with real-shaped disposable legacy accounts; pass CI and reviewed deployment checks. Do not collect real client health media through a shared preview account.

Rollback disables the rollout switch or uses a compatible prior release. Keep the new tables and objects; do not run destructive down migrations. Disabling the gate restores legacy application behavior and is an explicit operational choice. The code does not disable its own gate on provider failures.

Rehearsal verified the switch-off rollback using the v2-capable binary with both legacy and newly completed v2 profiles. Deploy this compatible binary with the gate off before enabling the transition. After any new-flow completion, do not roll back to a pre-onboarding binary: its profile parser requires the old identity, anchor, draft-consent and story fields and can reject profiles created by the new flow. Roll back the switch on the compatible binary instead, preserving all submitted data.
