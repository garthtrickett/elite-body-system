import { render, nothing } from "lit-html";
import { mountAuth } from "./features/auth/browser.ts";
import { mountScorecard } from "./features/scorecard/browser.ts";
import { mountTraining } from "./features/training/browser.ts";
import { mountMeals } from "./features/meals/browser.ts";
import { mountLearning } from "./features/learning/browser.ts";
import { mountOnboarding } from "./features/onboarding/browser.ts";
import { workspaceShell } from "./shared/browser-layout.ts";
import { appRoute } from "./shared/app-routes.ts";
import { createBrowserNavigation } from "./shared/browser-navigation.ts";
import type { ResolvedRoute } from "./shared/navigation-model.ts";
import type { NavigationGuard, RouteRuntime } from "./shared/browser-route.ts";

const root = document.querySelector<HTMLElement>("#app");
if (root) {
  let latestAccount = { email: "", busy: false, problem: "" };
  let feature: RouteRuntime | undefined, navigation: ReturnType<typeof createBrowserNavigation> | undefined;
  let featureDisposed = true;
  const disposeFeature = () => { if (!featureDisposed) { featureDisposed = true; feature?.dispose(); } };
  const retainsFeature = (route: ResolvedRoute, previous: ResolvedRoute) => route.accountId === previous.accountId
    && (route.href === previous.href || route.page === previous.page && !!feature?.retain);
  let current: ResolvedRoute | undefined, guard: NavigationGuard = { kind: "ready" }, status = "", retry: (() => void) | undefined;
  const outlet = document.createElement("div"); outlet.className = "sc-route-outlet";
  const showShell = () => {
    if (!current || current.page === "sign-in") return;
    render(workspaceShell({ page: current.page, panel: new URL(current.href, location.origin).searchParams.get("panel") ?? undefined,
      outlet, navigationDisabled: guard.kind === "blocked", status, retry }), root);
  };
  const disposeAuth = mountAuth(root, {
    presentHome: (state, actions) => {
      if (!state.account) return;
      const account = { email: state.account.email, busy: state.busy, problem: state.problem };
      latestAccount = account;
      if (feature) { feature.updateAccount?.({ account }); return; }
      const initial: ResolvedRoute = { href: location.pathname + location.search, page: appRoute(location.pathname)?.page ?? "scorecard", accountId: state.account.id };
      const mount = (route: ResolvedRoute, csrf: string) => {
        current = route;
        const host = { csrf, navigate: (href: string) => navigation?.navigate(href), replaceQuery: (key: "date", value: string) => navigation?.replaceQuery(key, value), navigationChanged: (value: NavigationGuard) => { guard = value; showShell(); } };
        showShell();
        feature = route.page === "onboarding" || route.page === "media" || route.page === "account-setup" ? mountOnboarding(outlet, { ...host, signOut: actions.signOut, account: latestAccount, marketingOnly: route.page === "media", accountSetupOnly: route.page === "account-setup" })
          : route.page === "training" ? mountTraining(outlet, host)
          : route.page === "meals" ? mountMeals(outlet, host)
          : route.page === "map" || route.page === "nutrition" || route.page === "activity" || route.page === "mindset" ? mountLearning(outlet, { ...host, page: route.page })
          : mountScorecard(outlet, { ...host, account: latestAccount, signOut: actions.signOut });
        featureDisposed = false;
        const panel = new URL(route.href, location.origin).searchParams.get("panel");
        document.title = `${panel === "profile" ? "Profile" : panel === "setup" ? "Day 1 setup" : appRoute(new URL(route.href, location.origin).pathname)?.title ?? "Scorecard"} · Elite Body System`;
      };
      navigation = createBrowserNavigation({ initial, csrf: root.dataset.csrf ?? "", root,
        guard: route => {
          const policy = feature?.navigation() ?? { kind: "ready" };
          return policy.kind === "confirm" && current && retainsFeature(route, current) ? { kind: "ready" } : policy;
        },
        revisit: () => feature?.revisit?.(),
        prepareTraversal: (route, previous) => { if (!retainsFeature(route, previous)) disposeFeature(); },
        present: model => { current = model.current; status = model.pending ? "Opening page…" : model.error; retry = model.retry ? () => navigation?.retry() : undefined; showShell(); },
        commit: (route, previous, csrf) => {
          if (route.page === "sign-in" || route.accountId !== initial.accountId) {
            // A different authentication context requires a fresh auth runtime.
            disposeFeature(); navigation?.dispose(); location.replace(route.href); return;
          }
          if (route.href === previous.href) return;
          if (previous.page === route.page && feature?.retain) {
            current = route; showShell(); feature.retain(route.href);
            const panel = new URL(route.href, location.origin).searchParams.get("panel");
            document.title = `${panel === "profile" ? "Profile" : panel === "setup" ? "Day 1 setup" : "Scorecard"} · Elite Body System`;
            return;
          }
          disposeFeature(); render(nothing, outlet); guard = { kind: "ready" }; mount(route, csrf);
          const content = outlet.querySelector<HTMLElement>("#workspace-content, .ob-shell");
          if (content) { content.scrollTop = 0; content.tabIndex = -1; if (!new URL(route.href, location.origin).searchParams.has("panel") && !outlet.querySelector("dialog[open]")) content.focus({ preventScroll: true }); }
          window.scrollTo({ top: 0, behavior: "instant" });
        },
      });
      mount(initial, root.dataset.csrf ?? "");
    },
  });
  window.addEventListener("pagehide", event => { if (!event.persisted) { navigation?.dispose(); disposeFeature(); disposeAuth(); } });
  window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
}
