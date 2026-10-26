# Harry’s onboarding: operation and rollout

The new flow is `harry-v2`. The operator confirmed that all clients must complete it, including clients who finished legacy setup. A confirmed Google Meet booking completes the call requirement; attendance is not required for dashboard access. Existing program dates, profile answers, consent history and scorecards are preserved.

## Configuration and rollout

`ONBOARDING_ENABLED=false` is the rollout default. The new `/onboarding` route and APIs can be verified before switching existing clients over. With `ONBOARDING_ENABLED=true`, every normal client page redirects incomplete accounts to onboarding and normal client APIs return `forbidden` with reason `onboarding_required`. Auth, sign-out, onboarding and health/assets remain available. Legacy `profile.completed` cannot satisfy this gate.

Do not enable the production gate until approved content, private media provider and actual booking confirmation have passed acceptance. Missing content/integrations do not count as completed steps. The blanket preparation banner has been removed from onboarding. No production settings have been changed by this implementation.

## Separate documents and coaching commitment

`content.documents` contains `parq`, `informed`, `participation` and `coaching`,
each with a version, title, text and its own explicit approval flag. The participation
document must match `consentVersion`/`consentText`; the readiness version must match
`parqVersion`. Use a new content version when updating documents. Defaults are original
EBS drafts, not an official licensed PAR-Q+ instrument, and are not open for signature.
Do not mark them approved merely to demonstrate a completed tick.

The first three forms are on Fitness Participation Agreement. Emergency contacts and
health-information consent are in Informed Consent. Adult/capacity confirmation is
in Participation Agreement. Physical submissions now appear with measurements.
Trainer–Client Agreement is below the separate coach-access section in Our Weekly
Rhythm. Its coach commitment is displayed in Harry Baldwin's name at his request;
the draft is not an executed coach signature. The four-week guarantee still needs
measurement criteria, review process and a remedy from the operator, plus suitable
claim support and legal review. Do not invent a refund, deadline or forfeiture condition.

Signing uses the existing revision-checked save and retains per-document evidence in
the onboarding record: exact text/version, acknowledgement, relevant fields and server
time. `GET /api/client/onboarding/document?kind=parq|informed|participation|coaching`
provides the authenticated client's current signed copy as a private text attachment.
The existing combined evidence is retained for historical records. New form ticks
require current saved evidence; drafts and changed answers do not receive a tick.
Production approval still needs the US state, business/privacy disclosures and
appropriate review for the client jurisdictions. Promotional media remains a separate
authorisation, and clients remain free to post their own content.

The commitment wording is original to EBS, informed by the structure of the
[ACE coaching agreement](https://contentcdn.eacefitness.com/assets/certification/ace-answers/forms/hc/SampleCoachingAgreement.pdf).
Relevant review references include [E-SIGN](https://www.law.cornell.edu/uscode/text/15/7001),
[ICO consent guidance](https://ico.org.uk/consent) and
[FTC advertising guidance](https://www.ftc.gov/business-guidance/resources/advertising-faqs-guide-small-business).


## Draft saving and section navigation

Questionnaire text and goal ranking autosave after a 600 ms pause. Background
saves leave the fields editable. Save responses reconcile against the answers
actually sent, retaining newer typing and ranking changes. Raw spaces remain in
the active answer while saved status uses server-normalized values. An uncertain
save also retains explicit reversions during recovery, while untouched fields
can accept other-tab updates. A pending save remains
protected against page unload. Other sections save when Complete is selected.

Complete saves the latest draft and moves to the next section in the
eight-section order. It can be requested during a background save; the current
section stays visible until any newer answers are also saved. Failed saves retain
the draft and section. Reload saved progress reconciles local edits with the
server before saving resumes. This uses the existing account storage and revision
checks, with no browser storage of assessment answers.

Section navigation is independent of completion eligibility except for a disclosed
health concern. Clients may otherwise advance
past incomplete answers, evidence or unconfigured guidance and return later. The
ready counter continues to reflect actual requirements. Finish onboarding and the
server gate still require every section, finalized evidence and a confirmed
booking.

Health screening appears first inside Fitness Participation Agreement. Any Yes answer
requires a short explanation and the separate declaration that a registered
physician has cleared the client for physical activity. Until both are saved,
Complete retains the draft in this section and navigation to later sections is
blocked, including attempts from earlier sections. Returning to earlier answers,
contacting Harry, signing out and withdrawing marketing permission remain available.
All-No screening does not require the clearance checkbox. The seven draft EBS
questions remain original wording, not an official PAR-Q+ form.

The declaration is self-reported and stored with signed consent evidence and a
server timestamp. Changing a health answer or its explanation clears the checkbox;
recovery cannot transfer an earlier declaration to changed screening. Previous
records default to unchecked, without altering historical completion or signed
documents. The server rejects completion and assessment uploads for an unexplained
or undeclared concern, even if a reviewer recorded an alternative. Harry's trusted
clearance review remains separately required for physical assessments/training.
This business rule does not claim that checking a box verifies a physician or
establishes clinical safety. [ACSM screening guidance](https://www.exerciseismedicine.org/assets/page_documents/EIM%20exercise%20preparticipation%20screening.pdf)
supports seeking medical clearance for concerning symptoms before exercise.

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

Start from `docs/onboarding-content.example.json`; its empty content is deliberately unapproved. Alternatively, the public `emptyContent()` operation includes the original EBS health/safety draft and seven draft screening questions, with `approved: false`. The validated content object is defined by `OnboardingContent` in `src/features/onboarding/data.ts`. Supply a unique `version`, `approved`, welcome text/video, communication text and HTTPS contact link, versioned participation agreement and seven approved health-screening questions, mobility test IDs/instructions/videos, strength/cardio/measurement videos and protocols, technique/weekly rhythm text and an HTTPS booking URL. A mobility entry has `id`, `label`, `instructions` and an HTTPS `videoUrl`. Never mark sample documents approved for clients.

Mobility IDs become stable submission slots. Limb fields use centimetres and body weight uses kilograms. Confirm the “ham/thigh” location and Harry’s test protocols in the approved guidance. Form bounds are broad input checks, not clinical reference ranges. The Start Point Form consists of nine text answers and a ten-goal ranking, including Mental wellness. Earlier seven- and nine-goal orders are preserved and extended with the missing choices; clients still onboarding must confirm the expanded order.

Content is archived by immutable version. Changing a version’s existing contents is rejected. Use a new version for changed instructions/documents; unfinished clients must acknowledge the new content and submit media against its protocol version. Completed clients retain their original version and completion record. This is intentionally separate from the existing exercise/course video registry: approval and assessment evidence must refer to one immutable onboarding content package, rather than independently mutable video keys.

### Fitness Participation Agreement: online-system draft

The section formerly called Physical audit · week one is now Fitness Participation Agreement. Its stored `audit` key and existing answers, signed evidence and assessment files retain their meaning. The physical assessments remain behind saved consent, screening and any required clearance.

The original combined `DRAFT_HEALTH_SAFETY` text is retained for historical compatibility. Current original drafts are `DRAFT_DOCUMENTS` in `src/features/onboarding/documents.ts`, exported from the public server interface. Informed Consent and Participation Agreement now have separate acceptance controls and full-name electronic signatures, while health-information consent remains its own checkbox. Each signed form retains its exact version, text, relevant answers and server timestamp. Historical combined agreements remain readable as originally signed.

Draft answers can be saved, but unapproved documents cannot produce a signed timestamp or authorise assessments. The adult/capacity declaration remains a service policy, not a claim that 18 is the universal age of contractual capacity. The seven EBS screening questions are original drafting and are not presented as an official PAR-Q+ or a clinically validated screening tool. A specific intentional electronic-signing process does not by itself establish enforceability worldwide: [15 USC 7001](https://www.law.cornell.edu/uscode/text/15/7001).

Confirmed facts: legal business name **Elite Body System**; United States business; fitness system delivered online; clients worldwide. Still needed: US state and legal contact address, privacy email/contact details, actual service-provider recipients and processing countries, retention rules and the service's separate payment/cancellation terms. Have qualified legal counsel review the final release for the relevant jurisdictions and a qualified exercise professional review the screening and assessment protocols before approving content. No choice of law, court, arbitration, ordinary-negligence waiver or fixed retention period has been invented.

#### Draft health-data privacy notice to complete before signing is enabled

**Who is responsible.** Elite Body System is responsible for the personal information used to provide its online fitness system. Contact: **[insert verified privacy email or online request route and business contact address]**. Relevant regional representative details, where required: **[confirm]**.

**What we collect and why.** We collect the health-screening answers and restrictions you give us, relevant measurements, progress photos and exercise-assessment recordings, along with account/contact information and service records. We use the health information to review readiness, identify questions requiring professional advice, adapt the requested fitness service and review your progress. The information comes from you and from records of your participation and coaching feedback. We ask for your explicit health-data consent separately from participation terms where required. The final notice must identify the applicable legal grounds; a service contract alone must not be described as permission for every use of sensitive health information.

**Who can receive it.** Access is limited to authorised EBS personnel and the service providers needed for the disclosed service functions. **[List the actual provider/recipient categories and relevant affiliates, purposes and processing locations after checking production configuration.]** Additional disclosures required by law must be explained as applicable. This consent does not authorise selling health information, targeted advertising, publishing transformation photos or testimonials, or training general-purpose AI on assessment media. Any optional use needing separate permission must be presented separately and may be refused without losing the purchased fitness service.

**International processing.** EBS is based in the United States. **[Identify other processing countries and the relevant transfer arrangements, such as applicable contractual safeguards.]** Clients' mandatory local privacy rights remain available. Agreeing to participate in fitness is not blanket consent to transfers or future undisclosed uses.

**Retention.** Keep information only as long as needed for the disclosed service and applicable legal obligations, then securely delete or appropriately de-identify it. **[Document category-specific periods or clear criteria, including assessment media, signed agreements, backups and genuine legal holds.]** Do not claim an immediate deletion capability or a fixed insurance-related retention period without confirming the operating process and requirements.

**Your choices and rights.** Use the privacy contact above to ask about your information, request access or a copy, correct inaccuracies, request deletion or restrictions, or withdraw consent to future collection/use. EBS will verify requests proportionately and respond under the laws that apply. **[Insert applicable deadlines, exceptions, appeal and regulatory complaint routes after jurisdiction review.]** Withholding or withdrawing health-data consent may affect a function that genuinely requires that information; EBS will explain that effect and discuss alternatives. Refusing publicity does not affect coaching. Requests will not be treated as a waiver of consumer rights. Lawful retention obligations may still apply to particular records.

This is a completion template, not a privacy notice ready for client publication. Placeholders belong in the review copy; replace them with verified facts and give clients the completed notice before collecting the relevant data. Update the immutable consent/content versions when the document changes. Do not add advertising/media permissions or a broader liability release to an existing signed version.

#### Research supporting the draft

- US health apps may have FTC privacy and breach-notification obligations even where HIPAA does not apply; assess the actual functions rather than claiming automatic HIPAA coverage. [FTC health-app guidance](https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0), [HHS app relationships](https://www.hhs.gov/hipaa/for-professionals/faq/does-hipaa-require-a-covered-entity-to-enter-into-a-business-associate-agreement.html).
- Present express health-data consent separately and keep data uses limited and clear. State health-data laws can add notice, collection/sharing-consent and rights requirements. [FTC best practices](https://www.ftc.gov/business-guidance/resources/mobile-health-app-developers-ftc-best-practices), [Washington consumer health-data law](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373&full=true).
- Worldwide delivery requires assessing clients' applicable rules: offering services to people in the EU can bring a non-EU business within GDPR scope. Information about purposes, recipients, retention, contacts and transfers needs to be provided before the relevant collection. [European Commission](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr_en), [ICO privacy information](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-be-informed/).
- Liability releases vary by location and service. New York's provision for certain paid recreational facilities is an example of a statutory restriction, not a conclusion that an online system is such a facility. [New York General Obligations Law § 5-326](https://www.nysenate.gov/legislation/laws/GOB/5-326). The draft therefore preserves negligence and mandatory consumer rights pending relevant jurisdiction review.
- Symptoms and medical conditions can require professional review before exercise. Severe symptoms require local urgent care rather than waiting for remote coaching. [ACSM exercise screening](https://www.exerciseismedicine.org/assets/page_documents/EIM%20exercise%20preparticipation%20screening.pdf), [NHLBI exercise risks](https://www.nhlbi.nih.gov/health/heart/physical-activity/risks), [MedlinePlus emergency symptoms](https://www.medlineplus.gov/ency/article/003079.htm).

## Optional Media & Testimonial Release

Health-data and participation consent does not authorise marketing. Onboarding
contains no media request. After a client achieves a meaningful milestone, Harry
can propose a specific success story using the trusted CLI. A quiet optional link
then appears near the client's progress cards. There is no automatic weight-loss
threshold, signup popup or permission inferred from assessment uploads.

Create a private JSON object with `title`, `results`, `testimonial` and `mediaIds`
(an array of at most six ready assessment UUIDs owned by the client). Text fields
may be empty if another type of content is supplied. The title identifies the
milestone; the operator must select a genuine result rather than treating completed
setup as proof of progress. The client must have completed setup before an invitation
can be created. Each request receives an immutable server ID and timestamp.

```sh
npm run onboarding:admin -- request-story ACCOUNT_ID /private/path/story.json
npm run onboarding:admin -- configure-marketing /private/path/marketing-release.json
npm run onboarding:admin -- review-marketing ACCOUNT_ID /private/path/marketing-history.json
```

`configure-marketing` accepts `version`, `approved` and `text`. The original draft
is `DRAFT_MARKETING_RELEASE`, exported from the public feature interface. It stays
unapproved until the missing privacy contact, provider recipients, retention and
international-processing disclosures and relevant legal review are complete.
Changed release text or approval status requires a new version. This approval is
independent of participation-document approval.

At `/account/media`, clients review the exact results/testimonial and can open each
proposed file. Only those materials are covered. Website, organic social and paid
advertising are separately selectable and unticked. Identity choices and restrictions
sit under an optional disclosure; without permission, names and recognisable features
must be omitted/obscured, or the material must not be published. The explicit approval
checkbox identifies the signer using their earlier entered full name (editable under
preferences) and confirms adult capacity, avoiding another compulsory name entry.
The complete release is available under a disclosure before approval.

New grants require the authenticated account's specific story, the current approved
release and matching material categories. Files are checked for ownership/readiness
both when a story is offered and when approved. A changed story is a new immutable
request and requires fresh approval. Recovery clears an earlier unsaved approval
when another story is loaded. No story publishing or sending of external messages is
automated. The scorecard invitation stops after that story has been approved and
stays stopped after withdrawal; Harry must create another request to invite again.

Media preferences stays available from desktop account navigation and the phone's
More menu, including before onboarding completion so earlier grants can be withdrawn.
A global withdrawal needs no new signature or approved replacement release and
clears all active story permissions. Multiple approved stories remain independently
scoped until withdrawal; changing channels for one story supersedes only that story's
previous choices. Legacy grants retain their original exact release and can be
withdrawn here. Every event retains the release, specific story, selected channels,
identity choices, restrictions, signer and server timestamp. Private history exports
use new mode-0600 files. Ordinary assessment saves do not alter this history.

Before publication, the operator must check the latest active permission for the
specific story and obey restrictions. On withdrawal, stop affected campaigns and
remove affected material from EBS-controlled digital channels. The application records
withdrawal; it does not remove external ads/posts. Independent copies cannot be
guaranteed removable. Set an appropriate consent-evidence retention policy.

This timing and layered presentation follows the
[ICO consent guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/consent/what-is-valid-consent/).
Permission does not substantiate an advertising claim: truthful testimonials,
material-relationship disclosures and generally expected results remain relevant
under [FTC endorsement guidance](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking).
The draft does not claim universal enforceability or replace applicable privacy
notices, transfer safeguards or consumer rights.

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
