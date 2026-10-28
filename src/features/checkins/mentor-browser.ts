import { render } from "lit-html";
import { createSamRuntime } from "../../shared/sam-runtime.ts";
import { createClientTransport } from "../../shared/browser-http.ts";
import type { RouteHost } from "../../shared/browser-route.ts";
import { acceptMentor, initialMentorModel, mentorNavigation } from "./mentor-model.ts";
import type { MentorEffect, MentorModel, MentorProposal } from "./mentor-model.ts";
import { parseMentorHistory, parseMentorQueue, parseMentorSummary, parseReviewReceipt } from "./mentor-data.ts";
import { mentorView } from "./mentor-view.ts";

export function mountMentorCheckins(root: HTMLElement, config: RouteHost & Readonly<{ csrf: string; signOut: () => void; account: Readonly<{ busy: boolean; problem: string }> }>) {
  const scope = new AbortController(), call = createClientTransport({ csrf: config.csrf, send: fetch, signal: scope.signal });
  let account = config.account;
  const runtime = createSamRuntime<MentorModel, MentorProposal, MentorModel, MentorEffect>({
    initial: initialMentorModel(), accept: acceptMentor, represent: model => model, next: model => model.pending,
    present: state => { if (scope.signal.aborted) return; render(mentorView({ state, propose: proposal => runtime.propose(proposal), signOut: config.signOut, accountBusy: account.busy, accountProblem: account.problem }), root); config.navigationChanged(mentorNavigation(state)); },
    failed: effect => {
      const result = { ok: false, error: { code: "unavailable", message: "This coach action could not finish. Try again." } } as const;
      return effect.kind === "load" ? { kind: "queueLoaded", id: effect.id, result } : effect.kind === "summary" ? { kind: "summaryLoaded", id: effect.id, result } : effect.kind === "history" ? { kind: "historyLoaded", id: effect.id, result } : { kind: "reviewed", id: effect.id, result };
    },
    perform: async effect => {
      if (effect.kind === "load") return { kind: "queueLoaded", id: effect.id, result: await call({ path: "/api/mentor/checkins", parse: parseMentorQueue }) };
      if (effect.kind === "summary") return { kind: "summaryLoaded", id: effect.id, result: await call({ path: "/api/mentor/checkins/summary", body: { clientId: effect.clientId, week: effect.week }, timeout: 55000, parse: parseMentorSummary }) };
      if (effect.kind === "history") return { kind: "historyLoaded", id: effect.id, result: await call({ path: `/api/mentor/checkins/history?clientId=${encodeURIComponent(effect.clientId)}${effect.before ? `&before=${encodeURIComponent(effect.before)}` : ""}`, parse: parseMentorHistory }) };
      return { kind: "reviewed", id: effect.id, result: await call({ path: "/api/mentor/checkins/review", body: { clientId: effect.clientId, week: effect.week, revision: effect.revision }, parse: parseReviewReceipt }) };
    },
  });
  const protect = (event: BeforeUnloadEvent) => { if (mentorNavigation(runtime.getModel()).kind !== "ready") { event.preventDefault(); event.returnValue = ""; } };
  const refresh = () => { if (document.visibilityState === "visible") runtime.propose({ kind: "refresh" }); };
  const timer = window.setInterval(refresh, 30000);
  window.addEventListener("beforeunload", protect);
  document.addEventListener("visibilitychange", refresh);
  runtime.propose({ kind: "started" });
  return { navigation: () => mentorNavigation(runtime.getModel()), revisit: refresh, dispose: () => { scope.abort(); window.clearInterval(timer); window.removeEventListener("beforeunload", protect); document.removeEventListener("visibilitychange", refresh); runtime.dispose(); }, updateAccount: (input: Readonly<{ account: Readonly<{ busy: boolean; problem: string }> }>) => { account = input.account; runtime.propose({ kind: "started" }); } } as const;
}
