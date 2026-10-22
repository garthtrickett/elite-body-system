# Independent onboarding audit and fixes

The operator requested an independent agent to find onboarding defects, report them, then fix and merge the result. The agent audited `f6cff3e9ca8b23bf4ebab32da5ff9d561c7280d1` using disposable PostgreSQL accounts, local media/provider fixtures and Chromium. It reproduced eight original defects: one P1 and seven P2. The root agent reproduced three additional storage/provider defects. Unavailable final content and live integrations were explicitly excluded from the bug count.

| Finding | Resulting behavior |
| --- | --- |
| P1: Changed PAR-Q questions inherited old health answers and could sign fresh evidence without fresh answers | A changed screening version or question list clears the seven answers. Content-only edits preserve unchanged screening answers. Completed historical evidence retains its original archive. |
| P2: Content updates hid earlier private uploads, preventing discovery/download/removal | Earlier submissions appear separately with owned download/removal controls. They do not satisfy current assessment requirements. |
| P2: Sparse Google cancellation tombstones left confirmed booking records stale | Cancellation of the exact previously verified event is reconciled using the prior time/Meet data, with a monotonic local version when Google omits `updated`. Repeated tombstones are idempotent. |
| P2: Validation feedback stole focus mid-entry, turning `80` into `8` | Explicit failed submissions focus their feedback; correcting a field retains keyboard focus as requirements change. |
| P2: Recovery from a transient save failure discarded unsaved answers | Reload reconciles the server revision while retaining local edits. A three-way merge preserves other-tab changes to fields the local client did not edit. Saving the reconciled draft remains an explicit action. |
| P2: Cancellation during upload authorization created an invisible unfinished file | Cancellation waits for the entire upload attempt and removes an issued pending authorization before loading the final state. |
| P2: Cancellation during finalization still submitted a file invisibly | Finalization has an explicit noncancellable finishing state. Cancellation before it starts prevents finalization and cleans up the pending attempt. |
| P2: Rejecting a corrupt file hid its pending row and could consume the upload quota | Definitively rejected attempts are removed and the updated snapshot is displayed. Uncertain finalization failures reload server state without deleting a possibly committed replacement. A prior ready submission is preserved. |
| Additional: SDK bucket-addressing fallbacks disagreed with the upload CSP origin | S3 signing and CSP use the same effective addressing decision, including dotted buckets and IP endpoints. |
| Additional: A missing old Google event prevented discovering an account-bound replacement | A known event's 404/410 triggers an ownership-checked replacement lookup. Missing or unowned replacements cannot preserve a false successful confirmation. |
| Additional: An invalid cached Google access token was reused until nominal expiry | A 401 triggers one token refresh and one bounded retry; persistent failures return the existing structured provider error. |

Rechecking the first fix candidate also caught a goal-confirmation merge regression before release: a local ranking could acquire another tab's confirmation of a different order. Ranking and its confirmation now reconcile together. This is recorded separately from the eleven original defects.

## Evidence and verification

The independent report, source hashes, exact reproductions, screenshots and negative probes are preserved in the isolated audit checkout at `.data/independent-onboarding-audit-20261022/`. The original report remains tied to the original source. Successor fix-candidate evidence records the recheck rather than rewriting the baseline. No production client data or unrelated databases were accessed.

Regression tests cover fresh screening evidence, retained earlier files, sparse cancellation/replays, missing-event replacement ownership, bounded OAuth recovery, S3 origins, per-field draft reconciliation, ranking confirmation, validation focus, interrupted authorization, noncancellable finalization and rejected replacements. Full acceptance and exact-head CI are required before merge. The onboarding rollout switch remains off pending approved content and actual provider connections.
