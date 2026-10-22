# Onboarding implementation validation

The local implementation passed final verification on 22 October 2026. Actual scheduling-service integration and production acceptance remain pending. This file distinguishes local evidence from external acceptance still needed before rollout.

Subsequent Railway compatibility refinement supports both path-style and bucket-subdomain S3 URLs, including the exact corresponding browser upload CSP origin. The tracked job `EBS Railway bucket compatibility checks` passed six tests, TypeScript, conventions and whitespace checks; its one skipped live-protocol case still requires the dedicated S3 runner. The operator selected Google Calendar and Railway private buckets and confirmed that final teaching videos and legal documents do not yet exist. Railway CLI authorization is expired; no bucket was provisioned. The earlier frozen source manifests below describe their original candidate, before this refinement.

The final tracked job `EBS onboarding Railway release acceptance` subsequently passed in 7m02s: **93 server/model tests, 57 Chromium tests, both dedicated S3 checks, schema regeneration and production Docker smoke checks**. The standard suite skips the S3 protocol case; the dedicated S3 runner executes it. All **173 files** in `.data/onboarding-acceptance-20261022/railway-refinement/source.sha256` matched after acceptance, as did the generated-type manifest. The candidate image is `sha256:bdb8a7a4faa8d63d3d1f9401528f5507f95540779eac7bd6da66ca52dd6e7945`. The original frozen evidence remains intact. Implementation is published as [draft PR #12](https://github.com/garthtrickett/elite-body-system/pull/12); remote CI must pass before merge. No production deployment or rollout is part of this acceptance.

## Verified locally

- Final tracked job: `EBS onboarding cancellation release acceptance`, exit 0. `bash scripts/with-postgres.sh npm run verify` passed **92 server/model tests and 57 Chromium tests**. The standard test run skips the S3 wire-protocol case; the same tracked runner then executed that case separately and it passed.
- The production Docker image built successfully and passed isolated PostgreSQL migrations, unprivileged runtime, asset/private-path checks, admin-tool packaging, authenticated onboarding redirects and API-gate checks.
- All **172 source/input files** in that earlier manifest matched after verification. Fresh-schema Kanel regeneration matched the pre-existing generated-type manifest. `git diff --check` passed. The latest candidate and draft PR are recorded above; merge and production deployment have not been performed for this change.
- Native Chromium mouse dragging and emulated touch dragging both moved goals correctly. A separate acceptance sweep checked **32 populated onboarding states** at 430px phone, 768px tablet, 200% equivalent reflow (720 CSS px at 2× device scale), and 200% text size, with no overflow or browser errors. These are browser-emulation checks, not physical Safari/iPhone verification.
- Additional operational acceptance passed: the rollout switch gates legacy-complete accounts when on and restores legacy access when off; newly completed v2 profiles remain readable in both modes. The actual review CLI wrote consent/completion evidence to a mode-0600 file and refused overwrite. The download CLI streamed a 512 KiB response in eight chunks into a matching mode-0600 file without printing signed URLs. This used disposable PostgreSQL and a local trusted TLS response fixture, not a real production bucket or Harry’s own operational access.

- Initial onboarding checks: 13 domain/SAM/provider tests and three Chromium tests passed before further refinements.
- S3 wire-protocol check: `bash scripts/with-assessment-s3.sh node --test test/onboarding-s3.test.ts` passed against digest-pinned Adobe S3Mock. It exercised actual HTTP PUT, HEAD, conditional COPY, range GET, signed-read generation and DELETE using the AWS SDK. It is a protocol mock, not evidence of a configured production bucket or of signature/expiry enforcement by a real provider.
- Desktop rhythm and narrow-phone questionnaire screenshots were inspected. The layout follows the existing serif/sans and warm neutral brand system; goals have touch and keyboard controls. Further mobile navigation refinement is recorded below.

## UI refinement review

| Before | After | Why |
| --- | --- | --- |
| Existing setup is a dismissible modal over the dashboard | Dedicated eight-section onboarding route with authoritative page/API gate | Everyone must complete the new flow, including legacy-complete clients |
| Questionnaire outcome is 12 weeks; history is partly multiple choice | Seven named free-text answers around 180 days and an explicitly confirmed ranked goal list | Match Harry’s questions and avoid treating a default order as the client’s choice |
| Mobile draft overview occupies much of the initial screen before the welcome content | Collapsed mobile section chooser; desktop section navigation remains visible | Give the welcome video and current task a stronger first impression |
| Signed upload can be mistaken for a finished assessment | Separate pending and finalized media with progress, retry and metadata/signature checks | Incomplete or invalid bytes cannot satisfy completion |
| Draft screening and self-confirmed doctor clearance are the only setup records | Versioned approved content, signed evidence and trusted health-clearance/alternative operations | Preserve the difference between completing onboarding and permission to exercise |
| New onboarding did not represent authentication failure state | Sign-out busy/error feedback, a confirmed dirty-exit effect and retained answers when exit is cancelled | Clients can recover without losing work or being left with a silent failed button |
| Cancelling an upload could replace newer draft answers with an older server response when its preparatory save failed | Cancellation waits for the preparatory save to settle and retains a draft that differs from saved answers | Keep the client’s answers available for retry, including a failed-save cancellation race |

## Still requires external acceptance

- Harry’s approved consent/PAR-Q, teaching videos and captions/transcripts, assessment/measurement protocols, communication and lifestyle wording.
- Google Calendar booking-page details and an actual trusted bridge attaching `ebsAccountId` to events, then verification of booking/rescheduling/cancellation and Meet details.
- Railway private bucket, CORS, actual signed upload/read/deletion, expiry/signature enforcement, chosen media-processing policy and retention agreement.
- Harry’s authorized review/download workflow, transition communication to existing clients and rollout authorization.

No live clients’ health data has been written and no production gate has been enabled by these tests.

## Requirement-to-evidence map

| Requirement | Implementation and relevant evidence | Boundary |
| --- | --- | --- |
| Eight sections and saved progress | `src/features/onboarding/data.ts`, `browser-model.ts`, `browser-view.ts`, `persistence.ts`; `test/browser/harry-onboarding.spec.ts` | Content is configured separately |
| Lock every client until completion | `eligible` in onboarding operations; authenticated page routing and client HTTP gate; legacy-account/direct-URL/read/write tests in `test/onboarding.test.ts` | Production switch remains off |
| 180-day questionnaire and goal order | Seven text fields plus one confirmed seven-goal permutation; domain and keyboard/persistence browser tests | No old 12-week answer is silently treated as a new answer |
| Consent and physical audit | Immutable content archive, signed timestamp, health evidence, configured mobility and three strength slots, selected cardio modality and screenshot | Approved documents/protocols/videos still needed |
| Measurements and photos | Eight paired/central circumference fields, kg starting weight and front/back/side slots; shared validation and readiness checks | Harry must confirm the ham/thigh location and instructions |
| Diet and sleep hygiene | Separate diet/feeling/symptom/sleep answers; required-field validation | Final prompt wording still needs acceptance |
| Communication and weekly feedback | Shared communication content in sections 4 and 7, accessible weekly loop, technique/trim guidance | Harry supplies actual guidance/contact details |
| Confirmed Meet booking | Server-owned booking record, account-bound Google adapter, duplicate/cancellation/reschedule tests and browser completion test | Actual scheduler-to-calendar account-binding bridge is not configured |
| Private, finalized uploads | Owned opaque keys, pending/ready states, verified type/size, immutable copy and controlled read/removal; memory-adapter ownership tests and separate HTTP S3Mock check | Production bucket, media-processing/retention policy and real provider enforcement still require acceptance |
| Preserve historical data | Versioned onboarding record separate from profile; completion transaction preserves legacy dates/weight/history and initializes only one scorecard | No production migration has been run |
| Health alternatives without training permission | Separate audited alternative and clearance resolutions; pending upload/clearance/completion tests | Trusted reviewer must establish actual clearance/alternatives |
| Conflict and failure recovery | Account locks, CAS revisions, stale-effect rejection, upload cancellation, sign-out feedback and confirmed dirty exit | External provider outages remain visible and cannot auto-unlock |
| Review and deployment packaging | Trusted review/download/resolution CLI; production image includes the admin entry point and passes isolated route/API-gate smoke checks | Harry’s actual access and operational review process remain unverified |

Private final evidence is retained under
`.data/onboarding-acceptance-20261022/cancellation-refinement/`: `acceptance.json`,
`source.sha256`, `verification.log`, generated-type comparison, frozen runner
hashes, screenshots, native gesture results and the additional reflow sweep.
The `operations/` subfolder records the subsequent rollout-switch and actual CLI
acceptance, its frozen runner hash and another source-manifest verification.
The parent folder preserves the earlier candidate’s evidence rather than
rewriting its proof hashes. All reported jobs terminated successfully.
