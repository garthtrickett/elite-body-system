import { appRoute } from "./app-routes.ts";
import { acceptNavigation, initialNavigation } from "./navigation-model.ts";
import type { NavigationModel, NavigationProposal, NavigationEffect, ResolvedRoute, RouteTarget } from "./navigation-model.ts";
import type { NavigationGuard } from "./browser-route.ts";
import { createSamRuntime } from "./sam-runtime.ts";
import { isRecord } from "./validation.ts";

const HISTORY_KEY = "ebsNavigation";
function historyIndex(state: unknown): number | undefined {
  return isRecord(state) && typeof state[HISTORY_KEY] === "number" && Number.isInteger(state[HISTORY_KEY]) ? state[HISTORY_KEY] as number : undefined;
}
function stamp(index: number, href: string, replace: boolean) {
  const state: unknown = history.state;
  history[replace ? "replaceState" : "pushState"]({ ...(isRecord(state) ? state : {}), [HISTORY_KEY]: index }, "", href);
}

/** One document-level click/pop listener pair. Feature runtimes own their own cleanup. */
export function createBrowserNavigation(config: Readonly<{
  initial: ResolvedRoute; csrf: string; root: HTMLElement;
  guard: (route: ResolvedRoute) => NavigationGuard;
  present: (model: NavigationModel) => void;
  commit: (route: ResolvedRoute, previous: ResolvedRoute, csrf: string) => void;
  revisit: () => void;
}>) {
  // Anti-CSRF material stays in the adapter closure, outside SAM state/proposals.
  const csrfByRoute = new WeakMap<ResolvedRoute, string>(); csrfByRoute.set(config.initial, config.csrf);
  let committed = 0, disposed = false;
  let restoring: RouteTarget | undefined, traversing: Readonly<{ route: ResolvedRoute; previous: ResolvedRoute; index: number }> | undefined;
  let controller: AbortController | undefined;
  stamp(0, config.initial.href, true);
  const apply = (route: ResolvedRoute, previous: ResolvedRoute) => {
    config.root.querySelector<HTMLElement>(".sc-route-outlet")?.removeAttribute("inert");
    const menu = config.root.querySelector<HTMLElement>("#workspace-more-menu");
    if (menu?.matches(":popover-open")) menu.hidePopover();
    config.commit(route, previous, csrfByRoute.get(route) ?? config.csrf);
  };
  const runtime = createSamRuntime<NavigationModel, NavigationProposal, NavigationModel, NavigationEffect>({
    initial: initialNavigation(config.initial), accept: acceptNavigation, represent: model => model, next: model => model.pending,
    present: model => {
      config.present(model);
      if (!model.committed || model.committed === committed) return;
      committed = model.committed;
      const previous = activeRoute;
      activeRoute = model.current;
      if (model.index !== activeIndex && pendingTarget?.index !== undefined) {
        traversing = { route: model.current, previous, index: model.index };
        // History traversal commits asynchronously. Freeze inputs after acceptance
        // until the matching pop event, so that final gap cannot admit a lost edit.
        config.root.querySelector<HTMLElement>(".sc-route-outlet")?.setAttribute("inert", "");
        history.go(model.index - activeIndex);
      } else {
        stamp(model.index, model.current.href, model.current.href === previous.href);
        activeIndex = model.index;
        apply(model.current, previous);
      }
    },
    failed: effect => ({ kind: "failed", id: effect.id }),
    perform: async effect => {
      if (effect.kind === "authorize") {
        const guard = effect.route.href === activeRoute.href && effect.route.accountId === activeRoute.accountId ? { kind: "ready" as const } : config.guard(effect.route);
        return { kind: "authorized", id: effect.id, accepted: guard.kind === "ready" || guard.kind === "confirm" && window.confirm(guard.message), message: guard.kind === "blocked" ? guard.message : "" };
      }
      controller?.abort(); controller = new AbortController();
      const response = await fetch(effect.target.href, { headers: { Accept: "application/json" }, credentials: "same-origin", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      const data: unknown = await response.json();
      const destination = new URL(response.url);
      if (!response.ok || destination.origin !== location.origin || !isRecord(data) || data.ok !== true || !isRecord(data.value)) throw new Error("Route unavailable");
      const value = data.value, expected = appRoute(destination.pathname)?.page ?? (destination.pathname === "/sign-in" ? "sign-in" : undefined);
      if (!expected || value.page !== expected || typeof value.csrf !== "string" || !(typeof value.accountId === "string" || value.accountId === null)) throw new Error("Invalid route");
      const route: ResolvedRoute = { href: destination.pathname + destination.search, page: expected, accountId: value.accountId };
      csrfByRoute.set(route, value.csrf);
      return { kind: "resolved", id: effect.id, route };
    },
  });
  let activeRoute = config.initial, activeIndex = 0, pendingTarget: RouteTarget | undefined;
  function request(target: RouteTarget): void {
    if (disposed || traversing) return;
    pendingTarget = target;
    if (target.href === activeRoute.href && target.index === undefined) { controller?.abort(); runtime.propose({ kind: "cancelled" }); config.revisit(); return; }
    runtime.propose({ kind: "requested", target });
  }
  const navigate = (href: string) => {
    const url = new URL(href, location.origin);
    if (url.origin !== location.origin || !appRoute(url.pathname) || url.hash) return;
    request({ href: url.pathname + url.search });
  };
  const clicked = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
    const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.hasAttribute("download") || anchor.target && anchor.target !== "_self" || anchor.rel.split(/\s+/).includes("external")) return;
    const url = new URL(anchor.href);
    if (url.origin !== location.origin || !appRoute(url.pathname) || url.hash) return;
    event.preventDefault(); navigate(url.href);
  };
  const popped = (event: PopStateEvent) => {
    const index = historyIndex(event.state);
    if (index === undefined) return;
    if (traversing && index === traversing.index) {
      const transition = traversing; traversing = undefined; activeIndex = index;
      stamp(index, transition.route.href, true); apply(transition.route, transition.previous); return;
    }
    if (index === activeIndex) {
      const target = restoring; restoring = undefined;
      if (target) request(target);
      return;
    }
    // Restore the active URL before checking permission or doing network work.
    // A cancelled or failed traversal therefore retains both draft and URL.
    restoring = { href: location.pathname + location.search, index };
    history.go(activeIndex - index);
  };
  document.addEventListener("click", clicked);
  window.addEventListener("popstate", popped);
  const scrollRestoration = history.scrollRestoration; history.scrollRestoration = "manual";
  return { navigate, replaceQuery: (key: "date", value: string) => {
    const url = new URL(activeRoute.href, location.origin); url.searchParams.set(key, value);
    activeRoute = { ...activeRoute, href: url.pathname + url.search };
    stamp(activeIndex, activeRoute.href, true);
    runtime.propose({ kind: "locationUpdated", href: activeRoute.href });
  }, retry: () => { const target = runtime.getModel().retry; if (target) request(target); }, dispose: () => { disposed = true; controller?.abort(); runtime.dispose(); document.removeEventListener("click", clicked); window.removeEventListener("popstate", popped); history.scrollRestoration = scrollRestoration; } } as const;
}
