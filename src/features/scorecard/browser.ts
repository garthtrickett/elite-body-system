import { clientDay } from "../profile/browser.ts";
import { render } from "lit-html";
import type { AccountState, ScorecardProposal, ScorecardState } from "./browser-model.ts";
import { createScorecardRuntime } from "./browser-runtime.ts";
import { createScorecardEffects } from "./browser-effects.ts";
import type { ScorecardActions } from "./browser-actions.ts";
import { scorecardView } from "./browser-view.ts";
import { hasUnsavedScorecard } from "./browser-model.ts";

export { acceptScorecardProposal, initialScorecardModel, representScorecard, nextScorecardAction, hasUnsavedScorecard } from "./browser-model.ts";
export type { ScorecardModel, ScorecardProposal, ScorecardState } from "./browser-model.ts";
export { createScorecardRuntime } from "./browser-runtime.ts";

export function mountScorecard(root: HTMLElement, config: Readonly<{ account: AccountState; signOut: () => void; csrf: string }>) {
  let shownPanel: ScorecardState["panel"];
  let shownStep: number | undefined, validationAttempt = 0, shownSyncError = "";
  function present(state: ScorecardState): void {
    render(scorecardView(state, actions), root);
    const panel = state.panel;
    const step = panel === "setup" ? state.profileUi.draft.setupStep : undefined;
    if (step !== shownStep) {
      shownStep = step;
      if (step !== undefined) {
        root.querySelectorAll<HTMLElement>("dialog, .sc-panel-body, .sc-setup-content").forEach(element => { element.scrollTop = 0; });
        root.querySelector<HTMLElement>(".sc-setup-progress")?.focus({ preventScroll: true });
      }
    }
    if (state.profileUi.validationAttempt !== validationAttempt) {
      validationAttempt = state.profileUi.validationAttempt;
      const field = root.querySelector<HTMLElement>('dialog [aria-invalid="true"]');
      field?.focus({ preventScroll: true }); field?.scrollIntoView({ block: "center", behavior: "instant" });
    }
    if (state.syncError && state.syncError !== shownSyncError && document.activeElement instanceof HTMLElement && root.contains(document.activeElement)) {
      document.activeElement.scrollIntoView({ block: "center", behavior: "instant" });
    }
    shownSyncError = state.syncError;
    if (shownPanel === panel) return;
    shownPanel = panel;
    // Synchronous DOM effects run once after acceptance and rendering. Native dialogs
    // own focus trapping, Escape behavior, and focus restoration to the trigger.
    const dialog = root.querySelector<HTMLDialogElement>("dialog");
    if (panel && !dialog?.open) dialog?.showModal();
    else if (!panel && dialog?.open) dialog.close();
  }
  function propose(proposal: ScorecardProposal): void {
    observeDay();
    runtime.propose(proposal);
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
    proposeProfile: proposal => propose({ kind: "profileProposed", proposal }),
    retrySync: () => propose({ kind: "retrySync" }),
    reloadClient: () => propose({ kind: "reloadClient" }),
    signOut: () => propose({ kind: "signOutRequested" }),
  };
  const panelQuery = new URLSearchParams(window.location.search).get("panel");
  const launchPanel = panelQuery === "profile" || panelQuery === "setup" ? panelQuery : undefined;
  const runtime = createScorecardRuntime({ ...(launchPanel ? { launchPanel } : {}), account: config.account, present, perform: createScorecardEffects({ csrf: config.csrf, send: fetch }), performUi: async effect => {
    if (effect.kind === "navigate") { location.assign(effect.href); return { kind: "navigationHandled", id: effect.id }; }
    if (effect.kind === "confirmReload") return { kind: "reloadConfirmed", id: effect.id, discard: window.confirm("Reload the saved version and discard your unsaved changes? Cancel to keep your draft and retry saving.") };
    const accepted = !effect.confirm || window.confirm("Sign out and discard your unsaved changes? Cancel to keep your session and continue editing.");
    if (accepted) config.signOut();
    return { kind: "signOutConfirmed", id: effect.id, accepted };
  } });
  runtime.propose({ kind: "started" });
  const keepDialogFocus = (event: KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const dialog = root.querySelector<HTMLDialogElement>("dialog[open]"); if (!dialog) return;
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>("button, input, textarea, select, a[href], [tabindex]"))
      .filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
  };
  root.addEventListener("keydown", keepDialogFocus);
  const protectUnsaved = (event: BeforeUnloadEvent) => { const model = runtime.getModel(); if (!model.exiting && hasUnsavedScorecard(model)) event.preventDefault(); };
  const observeDay = () => { const model = runtime.getModel(); if (model.loaded) runtime.propose({ kind: "dayObserved", date: clientDay({ timezone: model.profile.profile.timezone, now: new Date() }) }); };
  const dayTimer = window.setInterval(observeDay, 15000);
  const onVisible = () => { if (document.visibilityState === "visible") observeDay(); };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("beforeunload", protectUnsaved);
  return {
    updateAccount: (input: Readonly<{ account: AccountState }>) => propose({ kind: "accountChanged", account: input.account }),
    dispose: () => { root.removeEventListener("keydown", keepDialogFocus); window.clearInterval(dayTimer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("beforeunload", protectUnsaved); runtime.dispose(); root.querySelector<HTMLDialogElement>("dialog")?.close(); },
  } as const;
}

export type { SyncEffect, SyncProposal } from "./browser-sync.ts";
