import { initialScorecardModel, acceptScorecardProposal, representScorecard, nextScorecardEffect } from "./browser-model.ts";
import type { ScorecardProposal, ScorecardState, AccountState, ScorecardUiEffect, ScorecardUiProposal } from "./browser-model.ts";
import type { SyncEffect, SyncProposal } from "./browser-sync.ts";

export function createScorecardRuntime(config: Readonly<{
  account: AccountState;
  launchPanel?: "profile" | "setup";
  present: (state: ScorecardState) => void;
  perform: (effect: SyncEffect) => Promise<SyncProposal>;
  performUi?: (effect: ScorecardUiEffect) => Promise<ScorecardUiProposal>;
}>) {
  let model = initialScorecardModel(config.account, config.launchPanel);
  let dispatched = 0;
  let disposed = false;
  function propose(proposal: ScorecardProposal): void {
    if (disposed) return;
    model = acceptScorecardProposal(model, proposal);
    config.present(representScorecard(model));
    const effect = nextScorecardEffect(model);
    if (!effect || effect.id <= dispatched) return;
    dispatched = effect.id;
    void Promise.resolve().then(async (): Promise<ScorecardProposal | undefined> => disposed ? undefined : effect.kind === "signOut" || effect.kind === "navigate" || effect.kind === "confirmReload" ? config.performUi?.(effect) ?? { kind: "syncFailed", id: effect.id } : config.perform(effect))
      .then(result => { if (result) propose(result); }).catch(() => propose({ kind: "syncFailed", id: effect.id }));
  }
  config.present(representScorecard(model));
  return { propose, getModel: () => model, dispose: () => { disposed = true; } } as const;
}
