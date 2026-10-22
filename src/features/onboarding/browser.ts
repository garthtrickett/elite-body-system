import { render } from "lit-html";
import { createSamRuntime } from "../../shared/sam-runtime.ts";
import { createClientTransport } from "../../shared/browser-http.ts";
import { isRecord } from "../../shared/validation.ts";
import { parseSnapshot, GOALS } from "./data.ts";
import type { Goal, OnboardingSnapshot } from "./data.ts";
import type { ClientResult } from "../../shared/client-result.ts";
import type { OnboardingModel, OnboardingProposal, OnboardingEffect } from "./browser-model.ts";
import { acceptOnboarding, initialOnboardingModel, representOnboarding } from "./browser-model.ts";
import { onboardingView } from "./browser-view.ts";

export { acceptOnboarding, initialOnboardingModel, representOnboarding } from "./browser-model.ts";
export type { OnboardingModel, OnboardingProposal, OnboardingEffect } from "./browser-model.ts";
export function mountOnboarding(root: HTMLElement, config: Readonly<{ csrf: string; signOut: () => void; account: Readonly<{ busy: boolean; problem: string }> }>) {
  const call = createClientTransport({ csrf: config.csrf, send: fetch });
  const files = new Map<number, File>(), controllers = new Map<number, AbortController>();
  const preparations = new Map<number, Promise<ClientResult<OnboardingSnapshot>>>();
  let selection = 0, shownSection = "", shownError = "", dragged: Goal | null = null;
  const unavailable = () => ({ ok: false, error: { code: "unavailable", message: "The file could not be uploaded. Reload saved progress, remove any unfinished upload and try again." } } as const);
  function moveTo(target: Goal) {
    const model = runtime.getModel();
    if (!dragged || model.pending || model.snapshot?.completedAt) return;
    const goals = [...model.draft.goals], from = goals.indexOf(dragged), to = goals.indexOf(target);
    if (from !== to && from >= 0 && to >= 0) { goals.splice(from, 1); goals.splice(to, 0, dragged); runtime.propose({ kind: "edit", answers: { ...model.draft, goals, goalsConfirmed: false } }); }
  }
  const runtime = createSamRuntime<OnboardingModel, OnboardingProposal, ReturnType<typeof representOnboarding>, OnboardingEffect>({
    initial: { ...initialOnboardingModel(), accountBusy: config.account.busy, accountProblem: config.account.problem }, accept: acceptOnboarding, represent: representOnboarding, next: model => model.pending,
    present: state => {
      const previousFocus = document.activeElement;
      const focusedGoal = previousFocus instanceof HTMLElement ? previousFocus.closest<HTMLElement>("[data-goal]")?.dataset.goal : undefined;
      render(onboardingView(state, {
        propose: proposal => runtime.propose(proposal), signOut: () => runtime.propose({ kind: "signOut" }),
        upload: ({ slot, file }) => { if (!file || runtime.getModel().pending) return; const current = ++selection; files.set(current, file); runtime.propose({ kind: "upload", slot, selection: current }); },
        drag: goal => { dragged = goal; }, drop: goal => { moveTo(goal); dragged = null; },
        rankStart: (event, goal) => { if (event.pointerType === "mouse") return; event.preventDefault(); dragged = goal; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); },
        rankMove: event => { if (!dragged || event.pointerType === "mouse") return; const goal = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-goal]")?.dataset.goal; if (goal && GOALS.includes(goal as Goal)) moveTo(goal as Goal); },
        rankEnd: () => { dragged = null; },
      }), root);
      if (focusedGoal && previousFocus instanceof HTMLButtonElement && previousFocus.disabled) root.querySelector<HTMLElement>(`[data-goal="${focusedGoal}"] .ob-rank-handle`)?.focus();
      if (state.snapshot && state.section !== shownSection) {
        shownSection = state.section;
        root.querySelector<HTMLDetailsElement>(".ob-nav-mobile")?.removeAttribute("open");
        const heading = root.querySelector<HTMLElement>(".ob-title"); heading?.focus({ preventScroll: true }); heading?.scrollIntoView({ block: "start", behavior: "instant" });
      }
      const error = state.error || (state.showMissing ? state.missing?.[state.section].join("|") ?? "" : "");
      if (error && error !== shownError) { const feedback = root.querySelector<HTMLElement>(".ob-feedback"); feedback?.focus({ preventScroll: true }); feedback?.scrollIntoView({ block: "center", behavior: "instant" }); }
      shownError = error;
    },
    failed: effect => ({ kind: "failed", id: effect.id }),
    perform: async effect => {
      const completed = (result: Awaited<ReturnType<typeof load>>) => ({ kind: "completed", id: effect.id, effectKind: effect.kind, result } as const);
      if (effect.kind === "signOut") {
        const accepted = !effect.confirm || window.confirm("Sign out and leave your unsaved answers? Save progress first if you want to keep them.");
        if (accepted) config.signOut();
        return { kind: "signOutConfirmed", id: effect.id, accepted };
      }
      if (effect.kind === "navigate") { location.assign(effect.href); return { kind: "failed", id: effect.id }; }
      if (effect.kind === "load") return completed(await load());
      if (effect.kind === "refreshBooking") return completed(await call({ path: "/api/client/onboarding/booking/refresh", body: {}, parse: parseSnapshot, timeout: 30000 }));
      if (effect.kind === "cancelUpload") {
        for (const controller of controllers.values()) controller.abort();
        await Promise.allSettled([...preparations.values()]);
        return completed(await load());
      }
      if (effect.kind === "save") return completed(await call({ path: "/api/client/onboarding/save", body: effect, parse: parseSnapshot }));
      if (effect.kind === "complete") return completed(await call({ path: "/api/client/onboarding/complete", body: { revision: effect.revision }, parse: parseSnapshot }));
      if (effect.kind === "remove") return completed(await call({ path: "/api/client/onboarding/media/remove", body: { id: effect.mediaId }, parse: parseSnapshot }));
      if (effect.kind === "read") {
        const result = await call({ path: "/api/client/onboarding/media/read", body: { id: effect.mediaId }, parse: value => isRecord(value) && typeof value.url === "string" && value.url.startsWith("https://") ? value.url : undefined });
        if (result.ok) { const link = document.createElement("a"); link.href = result.value; link.rel = "noopener noreferrer"; link.target = "_blank"; link.click(); }
        return { kind: "fileOpened", id: effect.id, result: result.ok ? { ok: true, value: { opened: true } } : result };
      }
      const file = files.get(effect.selection); files.delete(effect.selection);
      if (!file) return completed(unavailable());
      const controller = new AbortController(); controllers.set(effect.id, controller);
      try {
        const preparation = call({ path: "/api/client/onboarding/save", body: effect, parse: parseSnapshot });
        preparations.set(effect.id, preparation);
        const saved = await preparation;
        if (!saved.ok) return completed(saved);
        if (controller.signal.aborted) return completed(await load());
        const authorization = await call({ path: "/api/client/onboarding/media/request", body: { slot: effect.slot, mediaType: file.type, size: file.size }, parse: value => {
          if (!isRecord(value) || typeof value.id !== "string" || typeof value.url !== "string" || !value.url.startsWith("https://") || !isRecord(value.headers) || !Object.values(value.headers).every(header => typeof header === "string")) return undefined;
          return { id: value.id, url: value.url, headers: value.headers as Record<string, string> };
        } });
        if (!authorization.ok) return { ...completed(authorization), saved: saved.value };
        const a = authorization.value;
        await uploadFile({ file, url: a.url, headers: a.headers, signal: controller.signal, progress: progress => runtime.propose({ kind: "progress", id: effect.id, progress }) });
        const finalized = await call({ path: "/api/client/onboarding/media/finalize", body: { id: a.id }, parse: parseSnapshot, timeout: 60000 });
        return { ...completed(finalized), saved: saved.value };
      } catch { return completed(unavailable()); }
      finally { controllers.delete(effect.id); preparations.delete(effect.id); }
    },
  });
  function load() { return call({ path: "/api/client/onboarding", parse: parseSnapshot }); }
  const protect = (event: BeforeUnloadEvent) => { const model = runtime.getModel(); if ((model.dirty && !model.exiting) || model.pending?.kind === "upload") event.preventDefault(); };
  window.addEventListener("beforeunload", protect);
  runtime.propose({ kind: "started" });
  return { updateAccount: ({ account }: Readonly<{ account: Readonly<{ busy: boolean; problem: string }> }>) => runtime.propose({ kind: "accountChanged", busy: account.busy, problem: account.problem }), dispose: () => { for (const controller of controllers.values()) controller.abort(); files.clear(); window.removeEventListener("beforeunload", protect); runtime.dispose(); } } as const;
}
function uploadFile(input: Readonly<{ file: File; url: string; headers: Readonly<Record<string, string>>; signal: AbortSignal; progress: (percent: number) => void }>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (input.signal.aborted) { reject(new Error("Cancelled")); return; }
    const request = new XMLHttpRequest();
    request.open("PUT", input.url); request.timeout = 10 * 60 * 1000;
    for (const [name, value] of Object.entries(input.headers)) request.setRequestHeader(name, value);
    const abort = () => request.abort(); input.signal.addEventListener("abort", abort, { once: true });
    const clean = () => input.signal.removeEventListener("abort", abort);
    request.upload.onprogress = event => { if (event.lengthComputable) input.progress(Math.round(event.loaded / event.total * 100)); };
    request.onload = () => { clean(); if (request.status >= 200 && request.status < 300) resolve(); else reject(new Error("Upload failed")); };
    request.onerror = request.ontimeout = request.onabort = () => { clean(); reject(new Error("Upload interrupted")); };
    request.send(input.file);
  });
}
