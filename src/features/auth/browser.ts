import { render } from "lit-html";
import { createAuthUiEffects } from "./browser-effects.ts";
import { createAuthUiRuntime } from "./browser-runtime.ts";
import { authView } from "./browser-view.ts";
import type { AuthUiActions } from "./browser-view.ts";

export { createAuthUiRuntime } from "./browser-runtime.ts";
export { acceptAuthUiProposal, initialAuthUiModel, representAuthUi, nextAuthUiAction } from "./browser-model.ts";
export type { AuthUiEffect, AuthUiModel, AuthUiProposal, AuthUiState } from "./browser-model.ts";

export function mountAuth(root: HTMLElement): () => void {
  const mode = root.dataset.mode === "home" ? "home" : root.dataset.mode === "confirm" ? "confirm" : "request";
  // Bearer tokens stay in this effect closure, never the SAM model or view state.
  const token = location.hash.slice(1);
  history.replaceState(null, "", location.pathname);
  const changedLink = () => { if (location.hash) location.reload(); };
  window.addEventListener("hashchange", changedLink);
  const actions: AuthUiActions = {
    setEmail: ({ email }) => runtime.propose({ kind: "emailChanged", email }),
    requestLink: () => runtime.propose({ kind: "linkRequested" }),
    redeem: () => runtime.propose({ kind: "redemptionRequested" }),
    signOut: () => runtime.propose({ kind: "signOutRequested" }),
  };
  const runtime = createAuthUiRuntime({ mode,
    perform: createAuthUiEffects({ csrf: root.dataset.csrf ?? "", token, send: fetch, navigate: to => location.assign(to) }),
    present: state => render(authView(state, actions), root),
  });
  runtime.propose({ kind: "started" });
  return () => { runtime.dispose(); window.removeEventListener("hashchange", changedLink); };
}
