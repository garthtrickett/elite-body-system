# Elite Marketing System

Open **Elite Marketing System** in the management portal. Create one article at a
time. Drafts are private and saved in PostgreSQL; they are not published to the
website or YouTube.

1. **Subject:** research a relevant recent YouTube subject or add a source link.
   Explain why it matters to the EBS client. Starting ideas are suggestions, not
   claims that a subject is trending. Connected research looks at videos from the
   last 90 days and orders them by average views per day, not a verified global
   trend score. Watch the source and use your own experience rather than copying it.
2. **Interview:** answer six questions about the problem, experience,
   misconception, method, proof and next action. Speak naturally into a voice note,
   upload an audio file or type. Each recording is limited to two minutes and
   audio files to 8 MB. Check the transcript. Raw audio is sent for transcription
   but is not retained in the application database. A temporary failure keeps the
   audio in browser memory for manual retry or discard; closing the page removes it.
3. **Build:** all six answers and a source/client angle are required. The connected writing service edits your supplied answers into clear, short
   sections; the application inserts your proof verbatim into the blog and script.
   With no provider key, the preview arranges the original answers as an editable
   draft. Check every claim before using either output; do not publish unsupported
   experiences or outcomes. Rebuilding replaces both output drafts.
4. **Pictures:** add HTTPS URLs for owned/approved images, diagrams or results.
   Captions explain the point. Client material must already have the relevant
   permission; this workspace does not grant it.
5. **Export:** download Markdown for Notion and import through Notion’s import
   menu. The blog, images, source and YouTube script are included. Choose Serif in
   Notion for the nearest available heading style. Notion’s native editor does not
   reproduce arbitrary website fonts. Download the branded HTML version for the
   EBS font treatment. It loads fonts from the app and pictures from their URLs.
6. The final CTA links to **30 Days, 30 Insights from a National Pull-up and Dip
   Champion. Match your body to your success.** at `/free-value`.

Save a draft before switching articles or leaving. Another tab’s edits produce a
conflict rather than silently overwriting content. Downloads use the current
on-screen draft; save it as well to retain those edits in the library.

## Connections and pacing

- `YOUTUBE_API_KEY`: server-only YouTube Data API credential; research is disabled
  without it. The manual source workflow stays available.
- `OPENAI_API_KEY`: existing server-only key, also used for transcription through
  the file-transcription API. Voice controls are disabled without it; text remains
  available. Microphone recording requires browser permission on HTTPS or localhost.
- Optional `MARKETING_PROVIDER_RPM`: the actual provider request allowance, not a
  guessed tier. The marketing workspace reserves at most 80% of that allowance in a rolling
  minute: two HTTP calls for research and one for voice, with at least ten seconds
  between operations.
  Other applications sharing the account also consume its quota; set this to the
  allowance reserved for this workspace. Writing requests also count as one call.
  Daily YouTube quota and token/audio
  limits are separate provider constraints.
- One marketing provider operation runs at a time per app process. A provider 429
  pauses subsequent manual requests for Retry-After (bounded 10 seconds–15 minutes,
  default one minute). There is no automatic retry loop or bulk generation job.
- No Notion destination or connection has been supplied. Exports are usable now;
  nothing is sent to Notion automatically. No email insight series is enabled by
  this workflow. These are separate activation steps once content and destinations
  are supplied.
