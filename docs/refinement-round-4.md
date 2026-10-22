# Independent refinement round 4

A newly spawned agent audited merged PR #15 at
`38ea8e8108b9d695a02f4e321776db32f3ec37fb`. It reproduced one P2 workout
completion defect and one related P3 numeric-input inconsistency. The candidate recheck also confirmed that toggling
a reloaded zero-weight set silently replaced its load with a historical weight.
All three are addressed here. A new independent audit after merge remains the stop condition
for the refinement loop.

The superseded candidate recheck is preserved at
`/home/gust/code/worktrees/elite-body-system/refinement-round-4-recheck/.data/recheck/`.
It confirmed the original fixes, preserved held/newer drafts, and reproduced the
zero-weight replacement before this final correction.

| Before | After | Why |
| --- | --- | --- |
| Clearing reps then completing the set persisted the prescribed value but left the field blank, invalid and marked unsaved. The completed toggle became disabled and date/finish/navigation guards remained active. | Completing a set reconciles that row's weight and reps drafts with the accepted values. Other raw drafts remain intact. | Displayed input, saved data and unsaved protection must describe the same workout. |
| Entering `5,0` saved valid reps, but completing the set rejected the same input. | Commit, completion, field feedback and unsaved checks use one private numeric conversion. Completion displays canonical values. | A value accepted for saving must have the same interpretation when completing its set. |
| A saved zero-weight set displayed a historical placeholder after reload; toggling completion silently persisted the historical weight. | Stored zero remains visible and authoritative when undoing or redoing completion. History supplies weight only for an absent set row. | Toggling completion must preserve a saved bodyweight load and its volume. |

## Evidence

The independent baseline report and screenshots are retained at
`/home/gust/code/worktrees/elite-body-system/refinement-round-4/.data/round4/`.
Coverage included 260 local visual states, 40 configured onboarding states,
eight route reflow states and 40 read-only live states. Measurements found no
document overflow or browser errors; representative screenshots were inspected.
Functional probes covered save races, recovery, date changes, timers, lesson
completion, meal retry/idempotency, focus containment and configured onboarding
with fixture media/booking and server gating. Production client writes were
blocked; mutations used disposable local accounts and provider fixtures.

Pure model regressions cover fallback/history values, unrelated drafts and
comma-form weight/reps, and saved zero weights against heavier history.
The browser regression exercises cleared reps and comma
reps at 1440px and 390px, verifies saves/reloads, reverses completion and navigates
on the first click. A further desktop/phone regression seeds heavier completed history,
then verifies a current zero-weight set through undo/reload/redo/reload with direct
PostgreSQL-backed operation reads. Completed validation and candidate recheck results are
recorded in the PR and local work-board evidence.

Chromium viewport/CSS reflow checks do not establish physical iOS/Safari behavior.
Final approved media/legal documents, private storage and Google booking setup
remain launch dependencies. Mandatory production onboarding rollout is disabled.
