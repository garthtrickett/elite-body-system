# Independent refinement round 2

Baseline: `2e1cd364815bc33baea0347759f95e22de526739` (PR #13).
The operator requested repeated independent visual and functional audits, fixes,
and merges until a fresh auditor finds no significant remaining problem.

A fresh independent agent reproduced three P2 defects. Root reproduced two
related learning defects and extended draft protection to scorecard reload and
day rollover. The candidate recheck exposed three related P2 races, fixed in the same PR.
No significant visual defect was found in this round's baseline
screenshots; the changes below address navigation, recovery and state feedback.

| Before | After | Why |
| --- | --- | --- |
| Cancelling navigation after Sign out left the page open with a revoked session and a stuck button. | Confirm discarding changes before signing out. Cancel retains the session, draft and retry feedback. Accepted sign-out asks once; failure restores draft protection. | Clients can recover unsaved changes without being unexpectedly signed out. |
| Day 1 setup and `?panel=setup` sent completed new-flow clients into the obsolete 34-step dialog. | Both navigation paths select the saved eight-section onboarding. | Setup review matches the flow the client completed. |
| Profile fields, target text, metric text and unadded goals were omitted from the exit guard. | One pure predicate protects all these drafts during navigation, reload and automatic day rollover. | Closing a dialog does not make its unsaved edits disposable. |
| Reload saved version silently replaced unsaved scorecard or learning edits. | Reload asks before discarding; Cancel keeps the error and draft available for Retry. | Conflict recovery offers an explicit choice. |
| An older Map finish response closed the editor even after the final statement had been cleared while saving. | Finish responses close only the generation they saved. Newer text cancels the previous finish intent, stays in the builder and saves as a draft until a fresh completion action. | A response cannot present newer unfinished work as complete. |
| Setup buttons could replace a pending day-save effect, leaving the UI stale after a cancelled exit. | Account navigation waits for the save; model navigation cannot overwrite a pending effect. | A successful save must reconcile its generation and revision. |
| Lesson task fields stayed editable during irreversible completion, stranding newer text after the server froze the old answers. | Task fields and proposals freeze only during final submission; ordinary autosave remains editable. Editing after a failed completion cancels its previous finish intent. | Displayed completed answers match the durable submission. |
| Enter followed by blur resaved an unchanged metric and blocked the first navigation click. | Equal committed values retain the same day generation. | Navigation after a successful save works on the first attempt. |
| Learning save status could say Saving while a failed draft was waiting for recovery. | Error feedback takes priority and says Changes not saved. | Status reflects persistence rather than local editing. |

## Evidence and verification

The independent baseline report and reproducible probes are in
`/home/gust/code/worktrees/elite-body-system/refinement-round-2/.data/round2/`.
Its coverage includes 260 local render states, 32 onboarding section/viewport
states, and 40 read-only live states. Viewports include desktop, phone, narrow
phone, tablet, landscape and CSS reflow equivalent to 200% zoom. No document
overflow or browser errors were found in that sweep. Only disposable local
accounts were used for mutation probes; production client writes were blocked.

Regression coverage lives in `test/browser/refinement-round2.spec.ts`,
`test/scorecard-sync.test.ts` and `test/learning-sam.test.ts`. Tests exercise real
browser confirmation cancellation, authenticated-session survival, explicit
discard, setup routing, retry and a held Map finish response with newer input.
Pure transitions also cover stale confirmations and day rollover.

Full acceptance, candidate recheck and hosted CI are recorded in the associated
PR after completion. Local job output and candidate hashes are retained under
`.data/refinement-round-2/` and the operator's work board.

## Limits and next round

Chromium simulation does not prove physical iOS/Safari behavior. Missing final
videos/legal documents, the real Google booking configuration, private bucket
configuration and intentionally disabled mandatory rollout remain launch
dependencies. This patch does not enable rollout. A newly spawned audit after
merge remains required before declaring the refinement loop complete.
