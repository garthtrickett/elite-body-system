import { render } from "lit-html";
import { createSamRuntime } from "../../shared/sam-runtime.ts";
import { createClientTransport } from "../../shared/browser-http.ts";
import { isRecord } from "../../shared/validation.ts";
import type { RouteHost, RouteRuntime } from "../../shared/browser-route.ts";
import { mountMarketing } from "../marketing/browser.ts";
import { mountMentorDelivery } from "../delivery/browser.ts";
import { mountScorecard } from "../scorecard/browser.ts";
import { acceptManagement, initialManagement, managementNavigation } from "./management-model.ts";
import type { Area, ManagementModel, ManagementEffect, ManagementProposal } from "./management-model.ts";
import { parseManagement, parseJourney } from "./contracts.ts";
import { managementView } from "./management-view.ts";
export function mountManagement(root: HTMLElement, config: RouteHost & Readonly<{
    csrf: string;
    signOut: () => void;
    account: Readonly<{
        email: string;
        busy: boolean;
        problem: string;
    }>;
}>) {
    const scope = new AbortController(), call = createClientTransport({ csrf: config.csrf, send: fetch, signal: scope.signal }), outlet = document.createElement("div");
    const area: Area = location.pathname.endsWith("sales") ? "sales" : location.pathname.endsWith("system") ? "system" : "marketing";
    const url = new URL(location.href), tab = url.searchParams.get("tab");
    const initial = { ...initialManagement(area), selected: url.searchParams.get("lead") ?? "", before: url.searchParams.get("before") ?? "", search: url.searchParams.get("search") ?? "", salesMode: tab === "pages" ? "pages" as const : tab === "script" ? "script" as const : "pipeline" as const, systemView: new URL(location.href).searchParams.get("view") === "client" ? "client" as const : "coaching" as const };
    let child: RouteRuntime | undefined, account = config.account;
    const propose = (p: ManagementProposal) => {
        if (p.kind === "started" || p.kind === "systemView") {
            const status = child?.navigation();
            if (status && status.kind !== "ready") {
                runtime.propose({ kind: "workspaceBlocked", message: status.kind === "blocked" ? status.message : "Save your workspace edits before refreshing or changing views." });
                return;
            }
        }
        runtime.propose(p);
    };
    const guard = () => { const own = managementNavigation(runtime.getModel()); return own.kind !== "ready" ? own : child?.navigation() ?? own; };
    const runtime = createSamRuntime<ManagementModel, ManagementProposal, ManagementModel, ManagementEffect>({ initial, accept: acceptManagement, represent: m => m, next: m => m.pending,
        present: state => { render(managementView({ state, propose, signOut: config.signOut, accountEmail: account.email, outlet }), root); const own = managementNavigation(state); config.navigationChanged(own.kind !== "ready" ? own : child?.navigation() ?? own); },
        perform: async (effect) => {
            if (effect.kind === "confirmCancel")
                return { kind: "cancelConfirmed", id: effect.id, accepted: window.confirm("Cancel this booking and release the time? This updates the app. Contact the client separately to explain the change.") };
            if (effect.kind === "confirmDiscard")
                return { kind: "discardConfirmed", id: effect.id, accepted: window.confirm("Reload the saved version? Your unsaved edits will be discarded.") };
            if (effect.kind === "workspace") {
                child?.dispose();
                const host = { ...config, account, navigationChanged: () => config.navigationChanged(guard()) };
                child = effect.view === "marketing" ? mountMarketing(outlet, host) : effect.view === "coaching" ? mountMentorDelivery(outlet, host) : mountScorecard(outlet, host);
                return { kind: "workspaceMounted", id: effect.id };
            }
            if (effect.kind === "load")
                return { kind: "loaded", id: effect.id, result: await call({ path: `/api/management/snapshot?before=${encodeURIComponent(effect.before)}&search=${encodeURIComponent(effect.search)}`, parse: parseManagement }) };
            if (effect.kind === "journey")
                return { kind: "journeyLoaded", id: effect.id, result: await call({ path: `/api/management/journey?leadId=${encodeURIComponent(effect.leadId)}`, parse: parseJourney }) };
            return { kind: "written", id: effect.id, result: await call({ path: `/api/management/${effect.path}`, body: effect.body, parse: v => isRecord(v) && (effect.path === "settings" || effect.path === "lead" || effect.path === "booking/cancel" ? typeof v.revision === "number" && Number.isSafeInteger(v.revision) && v.revision > 0 : effect.path === "slots" ? typeof v.id === "string" && /^[a-f0-9-]{36}$/i.test(v.id) : v.removed === true) ? { acknowledged: true as const } : undefined }) };
        },
        failed: effect => {
            const result = { ok: false, error: { code: "unavailable", message: "This action could not finish. Try again." } } as const;
            return effect.kind === "confirmCancel" ? { kind: "cancelConfirmed", id: effect.id, accepted: false } : effect.kind === "confirmDiscard" ? { kind: "discardConfirmed", id: effect.id, accepted: false } : effect.kind === "workspace" ? { kind: "workspaceMounted", id: effect.id } : effect.kind === "load" ? { kind: "loaded", id: effect.id, result } : effect.kind === "journey" ? { kind: "journeyLoaded", id: effect.id, result } : { kind: "written", id: effect.id, result };
        },
    });
    const protect = (e: BeforeUnloadEvent) => {
        if (guard().kind !== "ready") {
            e.preventDefault();
            e.returnValue = "";
        }
    };
    const poll = window.setInterval(() => {
        if (area === "sales" && initial.salesMode === "pipeline" && document.visibilityState === "visible" && !runtime.getModel().pending && guard().kind === "ready")
            runtime.propose({ kind: "started" });
    }, 60000);
    window.addEventListener("beforeunload", protect);
    runtime.propose({ kind: "started" });
    return { navigation: guard, dispose: () => { window.clearInterval(poll); scope.abort(); child?.dispose(); runtime.dispose(); window.removeEventListener("beforeunload", protect); }, revisit: () => {
            if (guard().kind === "ready")
                runtime.propose({ kind: "started" });
        }, updateAccount: (input: Readonly<{
            account: Readonly<{
                email: string;
                busy: boolean;
                problem: string;
            }>;
        }>) => { account = input.account; child?.updateAccount?.(input); } };
}
