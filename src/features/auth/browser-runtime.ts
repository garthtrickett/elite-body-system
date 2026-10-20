import { acceptAuthUiProposal, initialAuthUiModel, nextAuthUiAction, representAuthUi } from "./browser-model.ts";
import type { AuthUiEffect, AuthUiMode, AuthUiProposal, AuthUiState } from "./browser-model.ts";

export function createAuthUiRuntime(config: Readonly<{
  mode: AuthUiMode;
  perform: (effect: AuthUiEffect) => Promise<AuthUiProposal | undefined>;
  present: (state: AuthUiState) => void;
}>) {
  let model = initialAuthUiModel(config.mode);
  let startedEffect = 0;
  let disposed = false;
  function propose(proposal: AuthUiProposal): void {
    if (disposed) return;
    model = acceptAuthUiProposal(model, proposal);
    config.present(representAuthUi(model));
    const effect = nextAuthUiAction(model);
    if (!effect || effect.id <= startedEffect) return;
    startedEffect = effect.id;
    // Run after acceptance and presentation. Results must cross the acceptor again.
    void Promise.resolve().then(() => disposed ? undefined : config.perform(effect))
      .then(result => { if (result) propose(result); })
      .catch(() => propose({ kind: "effectFailed", id: effect.id }));
  }
  config.present(representAuthUi(model));
  return {
    propose,
    getModel: () => model,
    dispose: () => { disposed = true; },
  } as const;
}
