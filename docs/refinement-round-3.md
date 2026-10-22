# Independent refinement round 3

A newly spawned agent audited merged commit
`25b9b7ac4a33adf670e009fa4ac7c3d7a0655f64` after PR #14. It reproduced two P2
training recovery/draft defects and two P3 usability defects. The candidate recheck also reproduced failed-meal reload loss and an exercise swap
clearing unrelated set drafts. All six findings are addressed together. The refinement loop still requires a fresh audit after this
round is merged.

| Before | After | Why |
| --- | --- | --- |
| A failed workout save kept saying Saving workout, and Reload saved workout silently replaced the unsaved note. | Saving reflects an active request. Unsaved/error feedback remains truthful. Reload asks before discarding, Cancel retains the draft/error, Retry persists it, and explicit discard clears the old completion intent. | Recovery must not silently erase useful session notes. |
| Invalid or uncommitted set text was absent from navigation/date guards and could disappear while status claimed it was saved. | One predicate includes raw set text for unload, date selection, reload and persistence feedback. Date changes retain the current workout until edits are corrected or explicitly discarded; unfinished set text cannot finish the workout. | Rejected input remains a client draft that needs correction. |
| Enter followed by blur resaved an equal set value and blocked the first navigation click. | Equal numeric values preserve the same workout generation. | A completed save leaves navigation available immediately. |
| Reload saved meals after a failed log silently removed the local review, even when nothing had been written. | Confirm discarding the review before reloading. Cancel preserves the error and exact idempotent retry payload. | An uncertain write must retain its recovery choice. |
| Swapping one exercise cleared raw set text for every exercise. | Keep raw drafts across swaps, including the original movement when switching back. | An unrelated exercise change cannot discard client input. |
| Removing an ingredient first validated that unwanted row, so a blank name or invalid number prevented removal. | Remove the selected row and its own raw fields directly; reindex and preserve every remaining raw edit. Validation remains authoritative when committing/logging. | Clients can discard an unwanted ingredient without inventing valid content for it. |

## Independent evidence

The baseline report, raw results, source hashes and screenshots are retained at
`/home/gust/code/worktrees/elite-body-system/refinement-round-3/.data/round3/`.
Coverage: 260 broad local visual states, 40 eight-section onboarding states,
eight main-route reflow states, and 40 read-only live states. There was no
measured overflow or browser error, and representative screenshots were manually
inspected. Additional functional probes verified configured onboarding media,
confirmed booking completion, mandatory route gating and meal uncertain-success
retry producing exactly one entry. Mutation probes used disposable accounts and
local storage/provider fixtures; production client writes were blocked.

Root reproduced the three training cases and ingredient-removal failure in
pure transitions before applying the fixes. Baseline logs and candidate/release
evidence are retained under `.data/refinement-round-3/` and the work board.
Regression coverage is in `test/training-sam.test.ts`, `test/meals-sam.test.ts`
and `test/browser/refinement-round3.spec.ts`. The PR records completed acceptance,
independent candidate recheck and hosted CI results.

Chromium viewport simulation and CSS reflow are not physical iOS/Safari tests.
Final videos/legal documents, private storage configuration and the actual Google
booking setup remain external launch dependencies. Mandatory production rollout
remains disabled.
