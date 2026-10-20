import { render } from "lit-html";
import { acceptScorecardProposal, initialScorecardModel, nextScorecardAction, representScorecard } from "./browser-model.ts";
import type { AccountState, ScorecardProposal } from "./browser-model.ts";
import type { ScorecardActions } from "./browser-actions.ts";
import { scorecardView } from "./browser-view.ts";

export { acceptScorecardProposal, initialScorecardModel, representScorecard, nextScorecardAction } from "./browser-model.ts";
export type { ScorecardModel, ScorecardProposal, ScorecardState } from "./browser-model.ts";

export function mountScorecard(root: HTMLElement, config: Readonly<{ account: AccountState; signOut: () => void }>) {
  let model = initialScorecardModel(config.account);
  let disposed = false;
  let shownPanel: typeof model.panel;
  function present(): void {
    render(scorecardView(representScorecard(model), actions), root);
    const effect = nextScorecardAction(model);
    const panel = effect.kind === "showPanel" ? effect.panel : undefined;
    if (shownPanel === panel) return;
    shownPanel = panel;
    // Synchronous DOM effects run once after acceptance and rendering. Native dialogs
    // own focus trapping, Escape behavior, and focus restoration to the trigger.
    const dialog = root.querySelector<HTMLDialogElement>("dialog");
    if (panel && !dialog?.open) dialog?.showModal();
    else if (!panel && dialog?.open) dialog.close();
  }
  function propose(proposal: ScorecardProposal): void {
    if (disposed) return;
    model = acceptScorecardProposal(model, proposal);
    present();
  }
  const actions: ScorecardActions = {
    changeMetric: input => propose({ kind: "metricChanged", ...input }),
    commitMetric: input => propose({ kind: "metricCommitted", ...input }),
    cancelMetric: input => propose({ kind: "metricCancelled", ...input }),
    toggleCheck: input => propose({ kind: "checkToggled", ...input }),
    selectCard: input => propose({ kind: "cardSelected", ...input }),
    startTouch: input => propose({ kind: "touchStarted", ...input }),
    endTouch: input => propose({ kind: "touchEnded", ...input }),
    openPanel: input => propose({ kind: "panelOpened", ...input }),
    closePanel: () => propose({ kind: "panelClosed" }),
    changeGoalDraft: input => propose({ kind: "goalDraftChanged", ...input }),
    changeBrainDump: input => propose({ kind: "brainDumpChanged", ...input }),
    addGoal: () => propose({ kind: "goalAdded" }),
    selectPriority: input => propose({ kind: "prioritySelected", ...input }),
    removeGoal: input => propose({ kind: "goalRemoved", ...input }),
    resetSample: () => propose({ kind: "sampleReset" }),
    signOut: config.signOut,
  };
  present();
  return {
    updateAccount: (input: Readonly<{ account: AccountState }>) => propose({ kind: "accountChanged", account: input.account }),
    dispose: () => { disposed = true; root.querySelector<HTMLDialogElement>("dialog")?.close(); },
  } as const;
}
