# Harry’s onboarding changes — implementation plan

Status: local flow implemented and verified; the actual scheduling-service bridge and production acceptance remain pending. Production rollout remains disabled pending approved content and integration acceptance. See [validation evidence](onboarding-validation.md) and [operating instructions](onboarding-operations.md).
Source: Harry’s onboarding requirements supplied by the operator, 22 October 2026.
Baseline: deployed release `ae5a35d5755d937302fcc7b8b84595d7baaf71cd`; live JS/CSS matched the reviewed release on inspection. Recheck the checkout before implementing.

Implementation decisions confirmed by the operator on 22 October 2026: a confirmed Google Meet booking satisfies the call section; all clients, including those who completed legacy setup, must complete the new flow. Preserve their historical data and program start dates. These decisions supersede the proposed grandfathering and attendance alternatives below. The rollout switch keeps the production transition deliberate while the implementation is verified.

## Outcome and scope

Replace the current 34-step setup dialog with eight clearly named onboarding sections. Clients can save, leave and resume across devices, but cannot enter the main dashboard or use normal client workflows until all required sections are complete. Week-one assessment instructions, uploads, communication guidance and call booking remain accessible inside onboarding.

This plan covers the client journey, its authoritative operations and storage, private assessment media, configured teaching content, booking and rollout. It does not add a coach portal, a general messaging integration, automatic medical clearance, AI assessment of bodies or videos, or a full recurring check-in/program-delivery system. Harry’s feedback-loop diagram explains the coaching process; it does not itself implement that process.

## Current app and reusable foundations

| Current implementation | Required change |
| --- | --- |
| `profile/onboarding-content.ts`: 34 steps; `browser-view.ts`: setup dialog | Dedicated onboarding route and eight-section overview, with focused screens inside each section |
| Setup opens on initial scorecard load but `panelClosed` dismisses it | Redirect incomplete accounts before rendering the dashboard; enforce corresponding API restrictions |
| `profile/data.ts`: 12-week outcome, story answers, starting weight | Versioned 180-day questionnaire, ranked goals, lifestyle answers and measurements |
| Draft health screening and `draft-v1` consent | Approved, versioned PAR-Q/consent content and recorded acknowledgements |
| Profile saves use revision checks and initialize a scorecard when `completed` is saved | Preserve conflict protection; move new-flow completion into one server-owned transaction |
| Training save rejects incomplete setup and unresolved health clearance | Preserve this protection and distinguish onboarding completion from permission to exercise |
| `features/content/index.ts` accepts only `exercise:` and `course:` video keys | Add validated onboarding content keys; configure videos, diagram, text and booking destination |
| Meal photos are resized for analysis and not stored on accounts | New private assessment-media storage; do not reuse meal-analysis handling |
| No assessment uploads or booking records | Add owned media records and authoritative booking status |

Existing auth, lit-html/Tailwind controls, SAM effects, account ownership and typed `Result` operations remain the foundations. Follow `docs/architecture.md` and the established brand plan in `docs/brand/brand-implementation-plan.md`.

## Client journey and completion rules

Present the sections in Harry’s order. Allow clients to revisit saved sections without deleting later work. Within the physical audit, consent/screening and any required clearance must precede exercise instructions that invite participation. Persist explicit completion, rather than treating page visits as completion. Missing configuration must never appear as a completed task.

| Section | Contents | Proposed completion evidence |
| --- | --- | --- |
| 1. Welcome | Harry’s welcome video, introduction and overview | Explicit “I’ve watched/read this” acknowledgement; do not pretend playback proves comprehension |
| 2. Questionnaire | Seven free-text questions and one goal-ranking question below | Every required answer valid and every goal ranked once |
| 3. Physical audit — week one | Approved consent/PAR-Q, mobility videos, push-up/pull-up/squat videos, cardio screenshot | Acknowledgements and screening recorded; every applicable submission uploaded and finalized, or explicitly resolved by an authorized exception |
| 4. Communication | Approved text explaining channel, expectations and how to contact Harry | Explicit acknowledgement; actual contact details configured |
| 5. Measurements | Instruction video, predefined fields and three progress photos | Required valid fields plus finalized front/back/side photos |
| 6. Lifestyle audit | Diet, response/symptoms and sleep-hygiene free text | Required answers saved, including explicit “none” where appropriate |
| 7. Rhythm for success | Weekly diagram, feedback-loop explanation, communication reminder, filming/trimming instructions | Explicit acknowledgement of the supplied guidance |
| 8. Onboarding call | Availability/booking experience and confirmed Google Meet appointment | Confirmed booking, not merely opening a link; attendance is not required (operator confirmed) |

The completion criteria above are proposals where Harry has not specified the precise rule. Resolve the decision register before enabling the lock for real clients. Keep save/resume and sign-out available throughout. Show incomplete reasons and the next action on the overview.

### Questionnaire: exact coverage

Store separate named answers, rather than overloading the old story keys:

1. What would be an incredible result for you over the next 180 days? What do you want to achieve?
2. What are your main reasons for doing this now? Your “WHY”?
3. What motivates you to stay committed to your fitness to achieve that result?
4. What in particular struggles need solving to achieve your desired result? Free text; “none identified” is valid.
5. Rank your fitness goals: Mobility, Strength, Gain muscle, Energy, Get fit, Get lean, Reduce pain, Consistency, Improve health markers. Store an ordered array of nine stable IDs, with no missing or duplicate entries. Use full-width cards supporting touch/drag and keyboard-accessible Move up/Move down controls. Require explicit confirmation of the order so an untouched default is not mistaken for a considered ranking.
6. Why did you choose EBS to solve this over other options?
7. What was the final thought that made you decide to sign up?
8. What previous experience do you have with personal training or fitness programs and why did you stop? Free text; “none” is valid.
9. When have you succeeded physically in the past, and what made you succeed? Free text; allow an honest “no example yet”.
10. Do you believe you're capable of achieving and maintaining Elite Body composition and Physical Performance for your age? If not, why not? If yes, why yes?

Keep the stored `size` and `cardio` goal IDs for Gain muscle and Get fit. Older seven-goal records retain their saved order, append Consistency and Improve health markers, and require confirmation of the expanded ranking. Existing answers stay under their original keys. Previously completed onboarding stays completed.

Use trimmed required text with explicit length limits and field-specific errors. Do not infer an answer from an older question with different meaning. In particular, a 12-week response is not a confirmed 180-day response.

Store the final belief question under its own `belief` key. Older records load with this answer empty; clients still completing onboarding must answer it. Previously completed onboarding remains completed.

### Physical audit

- Legal: approved informed consent and PAR-Q content, content version, signed name, acknowledgements and server timestamps. Existing draft records remain historical evidence, not approval of a new document.
- Mobility: Harry’s teaching video followed by the specified movement submissions. Harry must supply the movement list and per-test instructions.
- Strength: teaching guidance and separate client video slots for push-ups, pull-ups and squats. Clarify whether reps/results are also required and how inability to perform a movement is handled.
- Cardio: teach the run protocol, with cross trainer as first fallback and bike as the next. Record the selected modality and a treadmill/machine or fitness-app screenshot. Confirm duration, effort and any numerical result fields before implementation of validation.
- Do not demand exercise to unlock support when screening raises concerns. Represent `clearance_required` and a visible contact-Harry path; trusted resolution must record who approved an alternative or exemption and why. Client self-selection alone must not silently waive required assessments.
- Keep “week one” visible without inventing a seven-day expiry. The dashboard lock must not prevent access to audit activities or associated support.

### Measurements

Provide Harry’s measurement demonstration, unit labels and consistent instructions. Capture left and right values at the thickest point for bicep, ham/thigh and forearm; capture waistline and neck; collect front, back and side photos. Confirm the exact meaning/location of “ham”, measurement units, photo framing and whether both side views are needed. The supplied requirement calls for one side-photo slot unless clarified.

Proposed canonical storage is centimetres, with explicit units in the UI; define plausible bounds only after the protocol is approved. Preserve existing starting body weight for the current scorecard/trend dependency unless Harry explicitly removes it. Do not invent missing measurements or convert blank fields to zero.

### Lifestyle audit

Use separate free-text prompts for typical diet, how eating makes the client feel, digestive symptoms (including bloating, inflammation and diarrhoea as Harry’s examples), and sleep hygiene/routine. Final prompt wording and required/optional status need Harry’s approval. These are coaching responses, not diagnoses; do not generate medical conclusions from them.

### Rhythm and communication

Use an accessible diagram with a text equivalent: Saturday check-in → Harry reviews progress and feedback → Monday program delivery/adjustment → training and technique feedback → next check-in. Explain the continuous feedback loop; avoid countdowns or appointments that imply exact delivery times. Confirm whether Monday/Saturday labels are fixed expectations or examples.

Keep section 4 as the primary contact instructions; section 7 references the same authoritative communication content instead of introducing conflicting advice. Include how to film useful angles and trim clips before submission. Browser video editing is not required by Harry’s request; provide device guidance unless he requests an editor.

## Architecture and authoritative state

Create `src/features/onboarding` with server entry point `index.ts` and browser entry point `browser.ts`. It owns the versioned onboarding record, section validation, completion rules and submissions. Existing `profile` continues to own routine/targets and legacy profile data. Export narrow operations through entry points; do not import another feature’s internals.

Suggested operations, each accepting a named typed object and returning structured `Result`:

- `getOnboarding`: current version, revision, saved answers, section states, missing requirements and access status.
- `saveOnboardingSection`: validate and save a section against an expected revision; return authoritative state.
- `requestAssessmentUpload`, `finalizeAssessmentUpload`, `removeAssessmentUpload`: own the upload lifecycle and account/test/slot binding.
- `getOnboardingBooking`: retrieve verified appointment state; booking-provider callbacks update it through a validated server adapter.
- `completeOnboarding`: re-evaluate every required section and dependency in a transaction; client-supplied completion flags have no authority.
- Trusted `resolveAssessmentRequirement` and `resolveOnboardingBooking` operations only where an approved exception/manual confirmation policy requires them; no public client override endpoint.

Use stable failure codes such as `invalid_input`, `conflict`, `forbidden`, `not_configured`, `not_found` and `unavailable`, with explicit missing requirements in success state. Keep provider secrets and signed media URLs outside the SAM model and logs. Effects return correlated proposals; stale results cannot replace newer answers or finalize the wrong file/slot. Views render and emit actions only.

### Data and migrations

Add migrations for versioned onboarding records, assessment-media metadata, appointment records and necessary acknowledgement/exception evidence. Keep binary media out of profile JSON/PostgreSQL rows. A practical onboarding record includes account ID, flow version, revision, section data, section completion timestamps and final completion timestamp. Derive eligibility from saved evidence; cached section flags alone cannot authorize completion.

Media metadata includes account, section/test/slot, opaque storage key, actual media type/size, processing status and timestamps. Appointment records include account, provider booking ID, status, start/timezone, private join link and verified event version/time for out-of-order updates. Protect retries with idempotency keys/provider IDs and revision checks.

Before completion, editing an answer, deleting media or changing the protocol must revalidate dependent sections. Completion must use the current record revision and current finalized-media/verified-booking evidence, coordinating their database updates so concurrent deletion or cancellation cannot race an unlock. After completion, preserve the versioned completion evidence; subsequent corrections, media deletion and appointments follow explicit policies rather than silently resetting the client’s program. Retention policies may delete media while retaining only the permitted minimal evidence of prior submission.

Generate Kysely types using Kanel after migrations; never edit generated files manually. Preserve the existing `startDate`, first scorecard and history. New completion must atomically establish eligibility and initialize the first scorecard once, using existing authoritative operations; repeated completion must not reset dates or overwrite a day. If a previously incomplete legacy flow has already created daily entries, retain them.

### Dashboard and API gate

Implement one exported eligibility operation used by authenticated page routing and normal client API dispatch. For incomplete accounts, redirect page requests to `/onboarding`; API calls return a structured `forbidden` response with an onboarding-required reason. Browser navigation follows that state instead of rendering the dashboard behind a modal.

Explicitly allow auth/sign-out, onboarding reads/saves, configured teaching content, owned assessment uploads/reads, booking and necessary support/profile prerequisites. Gate the scorecard, training, meals, Neural Map and course workflows, including direct URLs and write endpoints. Public assets/health checks retain their operational roles. Avoid a redirect loop or blocking the profile fields needed to finish onboarding.

Onboarding completion does not erase medical restrictions: preserve separate training clearance checks. Finalize the legacy `profile.completed` relationship in the migration/completion adapter so it cannot bypass the new gate or inadvertently grant exercise permission. Re-evaluate eligibility on the server for writes and completion; do not trust a stale browser snapshot.

### Private media and mobile uploads

Use a private object store with short-lived upload/read authorization scoped to the signed-in account and designated slot. Choose provider and limits before coding the adapter. Verify actual stored object size/type and object ownership on finalization; a filename, client MIME header or upload-start event is insufficient. Reject active/unsupported content, isolate pending objects, and apply the selected provider’s media validation/scanning policy before marking a required upload ready.

Show upload progress, cancel/retry, ready/failed state, replacement and deletion. Retain an existing ready submission until its replacement is verified. Expired upload authorizations can be renewed; incomplete network transfers cannot count as submitted. Specify orphan cleanup, retention and deletion behavior, including account deletion. Do not promise uploads continue after the mobile browser closes; resume the onboarding record and offer file retry, using resumable transfers if the chosen provider supports them.

Clients can view only their own submissions. Harry needs a defined authorized review path before launch: preferably a narrow authenticated review/export operation and trusted tool initially, unless a coach UI is separately requested. Do not publish bucket URLs or use the shared preview account for real clients’ health media. Keep assessment media out of meal analysis and external AI providers.

### Booking and Google Meet

Select Harry’s existing scheduling service or a dedicated calendar adapter after checking his available setup. An approved scheduling link/embed may provide availability, but opening it is not confirmed booking. Associate the booking with the authenticated account through verified callback/reconciliation; never rely solely on an editable email address or return URL flag.

A ready appointment must have a confirmed date/time and Google Meet location. Handle provider failure, timezone display, duplicate events, rescheduling and cancellation. A verified manual confirmation is acceptable only if Harry approves that operating process. Decide whether cancellation before onboarding completion invalidates the call section; proposed yes. After final completion, surface a cancelled call for follow-up without unexpectedly relocking the entire app, unless Harry requests that policy. Do not build a custom availability engine without need.

## Existing clients and retained setup fields

The operator explicitly requires all clients to complete the new flow. Enabling the rollout switch therefore gates legacy-complete clients as well as new and unfinished accounts. Preserve their old completion and answers as history; only a server-recorded `harry-v2` completion unlocks the new gate. Announce the transition before enabling it, and do not silently reset program start dates, scorecards or body-weight history.

Preserve all legacy answers, consent versions, weight/history and routine settings. Offer old answers as clearly labelled references only where useful; require confirmation for the new questionnaire. Retain name, timezone, training days, rest day, equipment, injury workarounds, emergency contact and starting weight where existing operations depend on them, integrated as short prerequisite fields in appropriate sections. Confirm whether identity/daily-anchor/first-win prompts remain required, become optional, or move to the dashboard; do not silently add extra onboarding requirements beyond Harry’s approved flow.

## Implementation sequence

1. **Resolve product/content contracts.** Approve the decision register, required-field matrix, screening/consent, assessment protocol, content inventory, booking provider, media policy and legacy transition. Produce a reviewable section map and desktop/phone wireframes with the existing brand system.
2. **Introduce domain/storage.** Migrate versioned records and evidence; implement typed operations, authoritative validation, revision conflicts and transactional completion. Add the legacy adapter without enabling the new production gate.
3. **Build private assessment media.** Implement and verify the storage adapter, ownership, finalization, failure/retry/replacement, cleanup and Harry’s authorized review path.
4. **Build the eight-section client flow.** Add overview, navigation, questionnaire/ranking, audit, measurements, lifestyle, content and resumable progress using SAM. Extend the existing media-key validator/configuration tooling for onboarding keys. Preserve existing media behavior.
5. **Integrate booking.** Implement verified booking state and Meet details, reschedule/cancel reconciliation and provider failure states. Exercise with test appointments, not real invitations without authorization.
6. **Integrate the access gate and completion.** Route incomplete clients consistently, apply the API allowlist, connect profile/scorecard initialization and preserve health clearance. Test migration with completed and unfinished accounts.
7. **Accept and release.** Run the checks below, obtain Harry’s content/product acceptance, then use a reviewed PR and exact-commit CI. Merge/deploy only when authorized. Keep the new gate disabled until content, private storage and booking are ready; incomplete infrastructure must not trap clients.

## Verification and release criteria

- Domain tests cover all eight sections, each questionnaire answer and ranked permutation, measurements/units, finalized media requirements, exceptions, booking status and completion reasons.
- PostgreSQL integration tests cover ownership, revision conflicts, concurrent/repeated completion, historical data retention, consent timestamps/versioning, and first-scorecard initialization exactly once.
- Race tests cover completion against concurrent media deletion, section edits and booking cancellation; no stale section flag or old revision can unlock the dashboard.
- Access tests cover new/in-progress/completed/legacy clients, every normal page/API, direct navigation, expired sessions, sign-out and all permitted onboarding dependencies. An arbitrary `completed: true` profile payload cannot bypass the new gate.
- Media adapter tests cover another account’s object, forged slot/type/size, expired authorization, partial upload, rejected processing, failed replacement, deletion and orphan cleanup. Run an integration check against the selected provider before claiming real uploads work.
- Booking tests cover account binding, invalid/replayed/out-of-order callbacks, duplicates, absent Meet link, timezone, cancellation, reschedule and a lost response. Verify the actual chosen integration rather than only a stub.
- Browser tests cover save/resume after refresh and across devices, keyboard/touch ranking, section focus/scroll, required-field feedback, mobile file selection, long responses, upload/network failure and completion redirect. Do not write real client data during live acceptance.
- Inspect desktop, 320/390/430px phones, tablet, short landscape and 200% zoom. Keep errors/actions visible, labels clear, diagrams understandable without colour, and video controls usable; respect reduced motion and supply captions/transcripts with Harry’s media.
- Run narrow checks while developing, then `bash scripts/with-postgres.sh npm run verify`; verify generated schema types have no diff. Follow host shared-compute policy and track long jobs with `work run`/`work wait`.
- Before enabling production: approved content configured, actual upload/read/deletion verified with disposable data, actual booking/Meet verified, Harry’s review path verified, legacy migration rehearsed, exact-commit CI green and live acceptance passed. Record deployment commit and evidence.
- Rollback plan: use an explicit rollout switch and a compatible prior application release; preserve submitted records/objects and do not run destructive down migrations. Rehearse old/new-version compatibility. Any emergency gate bypass is a deliberate operational decision, not an automatic response to validation/provider failure.

Rollback rehearsal result: the rollout switch works with legacy and new v2 profiles on the new binary. A pre-onboarding binary is not a safe fallback once new v2 profiles exist, because its parser still requires legacy completion fields. Ship the v2-capable binary with the switch off first; use that compatible binary for switch-off rollback. See the validation record for the isolated operational test evidence.

## Decisions and material needed from Harry

| Decision/input | Proposed handling until resolved | Blocks |
| --- | --- | --- |
| Booking or attending completes the call section? | Confirmed: booking completes the section | Resolved |
| Existing completed clients must redo onboarding? | Confirmed: everyone completes the new flow | Resolved |
| Mobility movements, strength adaptations and cardio test protocol/results | No invented exercise protocol or client-controlled exemptions | Audit validation/content |
| “Ham” location, units, photo instructions, measurement bounds | Paired limb fields; centimetres proposed; front/back/one side | Measurement acceptance |
| What happens when health screening prevents an audit? | Contact Harry; authorized alternative/exemption, retain medical restrictions | Safe completion policy |
| Final PAR-Q and informed consent | Preserve draft history; configure approved versions before launch | Legal section release |
| Welcome, mobility, strength, cardio and measurement videos; captions/transcripts | Configurable content, visibly unavailable in development | Relevant sections/release |
| Communication channel, contact details, response expectations; weekly diagram and filming guidance | One authoritative content source, no fabricated promises | Guidance acceptance |
| Diet/symptom/sleep prompt wording and required status | Separate free-text prompts proposed | Lifestyle validation |
| Scheduling service, availability, Google connection and cancellation policy | Google Calendar confirmed; booking-page URL, trusted account bridge and Google authorization remain pending | Booking release |
| Private storage provider, file formats/limits, retention and Harry’s review access | Railway private S3-compatible Bucket selected; expired CLI login prevents provisioning; verify real uploads and agree retention before enabling collection | Upload release |
| Existing routine/identity/anchor/first-win questions | Preserve data/dependencies; confirm placement and required status | Final section map |

These unresolved inputs do not prevent completing this implementation plan. They are explicit prerequisites for the affected implementation or production launch, not assumptions disguised as requirements.

## Refinement record

1. **Requirements coverage:** mapped every supplied section, question, goal, upload and measurement. Kept communication and rhythm as separate sections sharing content; retained the run → cross trainer → bike fallback and 180-day horizon.
2. **Architecture and dependencies:** checked current profile validation/persistence, dashboard dismissal, training restrictions, media-key validation and client HTTP dispatch. Added the authoritative gate, versioned migration, profile completion compatibility and exactly-once scorecard initialization.
3. **Failure and operating review:** checked week-one lock deadlocks, health-related inability, unfinished/invalid uploads, lost booking responses, provider cancellation, existing clients, review access and rollback. Added completion-versus-deletion/cancellation race handling and post-completion evidence policy. Made uncertain product choices explicit launch dependencies.
4. **Acceptance review:** tied each change to domain, database, adapter, browser or deployment evidence. Kept this deliverable a plan; no implementation, commit, merge or production change is implied.
