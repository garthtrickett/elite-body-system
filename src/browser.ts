import { mountAuth } from "./features/auth/browser.ts";
import { mountScorecard } from "./features/scorecard/browser.ts";

const root = document.querySelector<HTMLElement>("#app");
if (root) {
  let scorecard: ReturnType<typeof mountScorecard> | undefined;
  const disposeAuth = mountAuth(root, {
    presentHome: (state, actions) => {
      if (!state.account) return;
      const account = { email: state.account.email, busy: state.busy, problem: state.problem };
      if (scorecard) scorecard.updateAccount({ account });
      else scorecard = mountScorecard(root, { account, signOut: actions.signOut });
    },
  });
  window.addEventListener("pagehide", event => { if (!event.persisted) { disposeAuth(); scorecard?.dispose(); } });
  window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
}
