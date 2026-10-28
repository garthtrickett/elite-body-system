import { render } from "lit-html";
import { createSamRuntime } from "../../shared/sam-runtime.ts";
import { createClientTransport } from "../../shared/browser-http.ts";
import type { RouteHost } from "../../shared/browser-route.ts";
import { parseHistory, parseSnapshot } from "./data.ts";
import { acceptCheckinProposal, checkinNavigation, initialCheckinModel, representCheckin } from "./browser-model.ts";
import type { CheckinEffect, CheckinModel, CheckinProposal } from "./browser-model.ts";
import { checkinView } from "./browser-view.ts";
export { mountMentorCheckins } from "./mentor-browser.ts";

export function mountCheckins(root: HTMLElement, config: RouteHost & Readonly<{ csrf: string; signOut: () => void; account: Readonly<{ busy: boolean; problem: string }> }>) {
  const scope = new AbortController(), call = createClientTransport({ csrf: config.csrf, send: fetch, signal: scope.signal });
  let account = config.account;
  let autosaveTimer: number | undefined;
  const runtime = createSamRuntime<CheckinModel, CheckinProposal, ReturnType<typeof representCheckin>, CheckinEffect>({
    initial: initialCheckinModel(), accept: acceptCheckinProposal, represent: representCheckin, next: model => model.pending,
    present: state => {
      if (scope.signal.aborted) return;
      render(checkinView({ state, propose: proposal => runtime.propose(proposal), signOut: config.signOut, accountBusy: account.busy, accountProblem: account.problem }), root);
      config.navigationChanged(checkinNavigation(state));
      window.clearTimeout(autosaveTimer);
      autosaveTimer = state.autosaveReady ? window.setTimeout(() => runtime.propose({ kind: "autosave", generation: state.generation }), 600) : undefined;
    },
    failed: effect => effect.kind === "history" ? { kind: "historyLoaded", id: effect.id, result: { ok: false, error: { code: "unavailable", message: "Older check-ins could not be loaded. Try again." } } }
      : effect.kind === "confirmReload" ? { kind: "reloadConfirmed", id: effect.id, accepted: false }
      : effect.kind === "focusProgress" ? { kind: "progressShown", id: effect.id }
      : effect.kind === "navigate" ? { kind: "navigated", id: effect.id }
      : { kind: "completed", id: effect.id, effectKind: effect.kind, result: { ok: false, error: { code: "unavailable", message: "Your check-in could not be saved or loaded. Try again." } } },
    perform: async effect => {
      if (effect.kind === "focusProgress") { root.querySelector<HTMLElement>("#checkin-progress")?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: "instant" }); return { kind: "progressShown", id: effect.id }; }
      if (effect.kind === "navigate") { config.navigate("/"); return { kind: "navigated", id: effect.id }; }
      if (effect.kind === "confirmReload") return { kind: "reloadConfirmed", id: effect.id, accepted: window.confirm("Reload your saved check-in? Unsaved edits will be discarded. If a save was interrupted, the saved account record will be loaded.") };
      if (effect.kind === "history") return { kind: "historyLoaded", id: effect.id, result: await call({ path: `/api/client/checkins/history?before=${effect.before}`, parse: parseHistory }) };
      return { kind: "completed", id: effect.id, effectKind: effect.kind, result: await call({ path: effect.kind === "load" ? "/api/client/checkins" : "/api/client/checkins/save", ...(effect.kind === "save" ? { body: { week: effect.week, revision: effect.revision, answers: effect.answers, rawMeasurements: effect.rawMeasurements, submit: effect.submit } } : {}), parse: parseSnapshot }) };
    },
  });
  const protect = (event: BeforeUnloadEvent) => { if (checkinNavigation(runtime.getModel()).kind !== "ready") { event.preventDefault(); event.returnValue = ""; } };
  window.addEventListener("beforeunload", protect);
  const flush = () => runtime.propose({ kind: "autosave", generation: runtime.getModel().generation });
  const refresh = () => { if (document.visibilityState === "visible") runtime.propose({ kind: "refresh" }); else flush(); };
  const reconnect = () => { if (runtime.getModel().uncertain) runtime.propose({ kind: "retry" }); else flush(); };
  const timer = window.setInterval(refresh, 60_000);
  document.addEventListener("visibilitychange", refresh);
  root.addEventListener("focusout", flush);
  window.addEventListener("online", reconnect);
  runtime.propose({ kind: "started" });
  return { navigation: () => checkinNavigation(runtime.getModel()), revisit: () => runtime.propose({ kind: "refresh" }), dispose: () => { scope.abort(); window.clearTimeout(autosaveTimer); window.clearInterval(timer); root.removeEventListener("focusout", flush); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("online", reconnect); window.removeEventListener("beforeunload", protect); runtime.dispose(); }, updateAccount: (input: Readonly<{ account: Readonly<{ busy: boolean; problem: string }> }>) => { account = input.account; runtime.propose({ kind: "started" }); } } as const;
}
