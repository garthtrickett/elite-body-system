import { render } from "lit-html";
import { createSamRuntime } from "../../shared/sam-runtime.ts";
import { createClientTransport } from "../../shared/browser-http.ts";
import { isRecord } from "../../shared/validation.ts";
import type { RouteHost, RouteRuntime } from "../../shared/browser-route.ts";
import { parseMentorHistory, mountMentorCheckins } from "../checkins/browser.ts";
import { clientDay } from "../profile/browser.ts";
import { acceptDelivery, initialDelivery, deliveryNavigation } from "./browser-model.ts";
import type { DeliveryModel, DeliveryProposal, DeliveryEffect, DeliveryTab } from "./browser-model.ts";
import { parseRoster, parseDetail, parseMember, parseThread } from "./browser-data.ts";
import { deliveryView } from "./browser-view.ts";
type Host = RouteHost & Readonly<{
    csrf: string;
    signOut: () => void;
    account: Readonly<{
        email: string;
        busy: boolean;
        problem: string;
    }>;
}>;
function mountDelivery(root: HTMLElement, config: Host & Readonly<{
    mentor: boolean;
    tab?: DeliveryTab;
    standalone?: boolean;
}>): RouteRuntime {
    const scope = new AbortController(), call = createClientTransport({ csrf: config.csrf, send: fetch, signal: scope.signal }), outlet = document.createElement("div"), prefix = config.mentor ? "/api/mentor/delivery" : "/api/client/coaching";
    let child: RouteRuntime | undefined, account = config.account;
    const guard = () => { const own = deliveryNavigation(runtime.getModel()); return own.kind !== "ready" ? own : child?.navigation() ?? own; };
    const propose = (p: DeliveryProposal) => {
        const childGuard = child?.navigation();
        if (p.kind === "tab" && childGuard && childGuard.kind !== "ready") {
            runtime.propose({ kind: "blocked", message: childGuard.message });
            return;
        }
        runtime.propose(p);
    };
    const runtime = createSamRuntime<DeliveryModel, DeliveryProposal, DeliveryModel, DeliveryEffect>({ initial: initialDelivery({ mentor: config.mentor, ...(config.tab ? { tab: config.tab } : {}), today: clientDay({ timezone: "UTC", now: new Date() }) }), accept: acceptDelivery, represent: m => m, next: m => m.pending,
        present: state => { render(deliveryView({ state, propose, outlet, standalone: config.standalone === true, signOut: config.signOut }), root); config.navigationChanged(deliveryNavigation(state)); },
        perform: async (effect) => {
            if (effect.kind === "mountCheckins") {
                if (child)
                    child.revisit?.();
                else
                    child = mountMentorCheckins(outlet, { ...config, account, navigationChanged: () => config.navigationChanged(guard()) });
                return { kind: "checkinsMounted", id: effect.id };
            }
            if (child && runtime.getModel().tab !== "checkins") {
                child.dispose();
                child = undefined;
            }
            if (effect.kind === "olderCheckins")
                return { kind: "historyLoaded", id: effect.id, result: await call({ path: `/api/mentor/checkins/history?clientId=${effect.clientId}&before=${effect.before}`, parse: parseMentorHistory }) };
            if (effect.kind === "roster")
                return { kind: "rosterLoaded", id: effect.id, result: await call({ path: `${prefix}/clients?search=${encodeURIComponent(effect.search)}&after=${encodeURIComponent(effect.after)}`, parse: parseRoster }) };
            if (effect.kind === "client") {
                const result = await call({ path: `${prefix}/client?clientId=${effect.clientId}`, parse: parseDetail });
                return { kind: "clientLoaded", id: effect.id, result, today: clientDay({ timezone: result.ok ? result.value.timezone : "UTC", now: new Date() }) };
            }
            if (effect.kind === "member")
                return { kind: "memberLoaded", id: effect.id, result: await call({ path: prefix, parse: parseMember }) };
            if (effect.kind === "community" || effect.kind === "olderThread")
                return { kind: "threadLoaded", id: effect.id, result: await call({ path: effect.kind === "community" ? `${prefix}/community${effect.before ? `?before=${effect.before}` : ""}` : `${prefix}/messages?clientId=${effect.clientId}&before=${effect.before}`, parse: parseThread }) };
            if (effect.kind === "read") {
                const result = await call({ path: `${prefix}/messages/read`, body: { clientId: effect.clientId, lastMessageId: effect.messageId }, parse: v => isRecord(v) && v.read === true ? { read: true as const } : undefined });
                return { kind: "read", id: effect.id, accepted: result.ok };
            }
            return { kind: "written", id: effect.id, result: await call({ path: `${prefix}/${effect.path}`, body: effect.body, parse: v => isRecord(v) && (typeof v.id === "string" || typeof v.revision === "number" && Number.isSafeInteger(v.revision)) ? { acknowledged: true as const } : undefined }) };
        },
        failed: effect => { const result = { ok: false, error: { code: "unavailable", message: "This coaching action could not finish. Try again." } } as const; return effect.kind === "olderCheckins" ? { kind: "historyLoaded", id: effect.id, result } : effect.kind === "roster" ? { kind: "rosterLoaded", id: effect.id, result } : effect.kind === "client" ? { kind: "clientLoaded", id: effect.id, result, today: "" } : effect.kind === "member" ? { kind: "memberLoaded", id: effect.id, result } : effect.kind === "community" || effect.kind === "olderThread" ? { kind: "threadLoaded", id: effect.id, result } : effect.kind === "write" ? { kind: "written", id: effect.id, result } : effect.kind === "read" ? { kind: "read", id: effect.id, accepted: false } : { kind: "checkinsMounted", id: effect.id }; },
    });
    const protect = (e: BeforeUnloadEvent) => {
        if (guard().kind !== "ready") {
            e.preventDefault();
            e.returnValue = "";
        }
    };
    const poll = window.setInterval(() => {
        if (document.visibilityState === "visible" && runtime.getModel().tab !== "checkins" && guard().kind === "ready")
            runtime.propose({ kind: "started" });
    }, 30000);
    window.addEventListener("beforeunload", protect);
    runtime.propose({ kind: "started" });
    return { navigation: guard, revisit: () => runtime.propose({ kind: "started" }), dispose: () => { scope.abort(); window.clearInterval(poll); window.removeEventListener("beforeunload", protect); child?.dispose(); runtime.dispose(); }, updateAccount: input => { account = input.account; child?.updateAccount?.(input); } };
}
export const mountMentorDelivery = (root: HTMLElement, config: Host & Readonly<{
    standalone?: boolean;
}>) => mountDelivery(root, { ...config, mentor: true });
export const mountMemberDelivery = (root: HTMLElement, config: Host & Readonly<{
    tab: "messages" | "community";
}>) => mountDelivery(root, { ...config, mentor: false });
