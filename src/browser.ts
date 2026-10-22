import { mountAuth } from "./features/auth/browser.ts";
import { mountScorecard } from "./features/scorecard/browser.ts";
import { mountTraining } from "./features/training/browser.ts";
import { mountMeals } from "./features/meals/browser.ts";
import { mountLearning } from "./features/learning/browser.ts";
import { mountOnboarding } from "./features/onboarding/browser.ts";

const root = document.querySelector<HTMLElement>("#app");
if (root) {
  let scorecard: ReturnType<typeof mountScorecard> | ReturnType<typeof mountTraining> | undefined;
  const disposeAuth = mountAuth(root, {
    presentHome: (state, actions) => {
      if (!state.account) return;
      const account = { email: state.account.email, busy: state.busy, problem: state.problem };
      if (scorecard) { if ("updateAccount" in scorecard) scorecard.updateAccount({ account }); }
      else {
        const csrf = root.dataset.csrf ?? "", page = root.dataset.page;
        scorecard = page === "onboarding" ? mountOnboarding(root, { csrf, signOut: actions.signOut, account }) : page === "training" ? mountTraining(root, { csrf }) : page === "meals" ? mountMeals(root, { csrf }) : page === "map" || page === "nutrition" || page === "activity" || page === "mindset" ? mountLearning(root, { csrf, page }) : mountScorecard(root, { account, signOut: actions.signOut, csrf });
      }
    },
  });
  window.addEventListener("pagehide", event => { if (!event.persisted) { disposeAuth(); scorecard?.dispose(); } });
  window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
}
