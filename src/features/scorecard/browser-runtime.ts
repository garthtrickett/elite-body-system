import { initialScorecardModel, acceptScorecardProposal, representScorecard, nextScorecardNetworkAction } from "./browser-model.ts";
import type { ScorecardProposal, ScorecardState, AccountState } from "./browser-model.ts";
import type { SyncEffect, SyncProposal } from "./browser-sync.ts";

export function createScorecardRuntime(config: Readonly<{
  account: AccountState;
  launchPanel?: "profile" | "setup";
  present: (state: ScorecardState) => void;
  perform: (effect: SyncEffect) => Promise<SyncProposal>;
}>) {
  let model = initialScorecardModel(config.account, config.launchPanel);
  let dispatched = 0;
  let disposed = false;
  function propose(proposal: ScorecardProposal): void {
    if (disposed) return;
    model = acceptScorecardProposal(model, proposal);
    config.present(representScorecard(model));
    const effect = nextScorecardNetworkAction(model);
    if (!effect || effect.id <= dispatched) return;
    dispatched = effect.id;
    void Promise.resolve().then(() => disposed ? undefined : config.perform(effect))
      .then(result => { if (result) propose(result); }).catch(() => propose({ kind: "syncFailed", id: effect.id }));
  }
  config.present(representScorecard(model));
  return { propose, getModel: () => model, dispose: () => { disposed = true; } } as const;
}
