import { html, render } from "lit-html";
import { createSamRuntime } from "../../shared/sam-runtime.ts";
import { createClientTransport } from "../../shared/browser-http.ts";
import { PUBLIC_PAGES, parsePublic } from "./contracts.ts";
import type { PublicPage } from "./contracts.ts";
import { acceptPublic, initialPublic } from "./public-model.ts";
import type { PublicModel, PublicProposal, PublicEffect } from "./public-model.ts";
import { publicPage } from "./public-view.ts";
import { applicationPage } from "./application-view.ts";
export function mountPublicSales(root: HTMLElement) {
    const scope = new AbortController(), page = PUBLIC_PAGES.includes(root.dataset.page as PublicPage) ? root.dataset.page as PublicPage : "free-value";
    const call = createClientTransport({ csrf: root.dataset.csrf ?? "", send: fetch, signal: scope.signal });
    let moreObserver: IntersectionObserver | undefined;
    const runtime = createSamRuntime<PublicModel, PublicProposal, PublicModel, PublicEffect>({ initial: initialPublic(page), accept: acceptPublic, represent: m => m, next: m => m.pending,
        present: state => {
            moreObserver?.disconnect();
            if (!state.snapshot) {
                render(html `<div class="sf-public sf-wrap"><h1>Elite Body System</h1><p role="status">${state.error || "Opening…"}</p>${state.error ? html `<button class="sf-button" @click=${() => runtime.propose({ kind: "started" })}>Try again</button>` : ""}</div>`, root);
                return;
            }
            const input = { state, settings: state.snapshot.settings, propose: (p: PublicProposal) => runtime.propose(p) };
            render(publicPage(input, page === "apply" ? applicationPage(input) : html ``), root);
            const more = root.querySelector<HTMLElement>("[data-more-stories]");
            if (more && "IntersectionObserver" in window) {
                moreObserver = new IntersectionObserver(entries => {
                    if (entries.some(entry => entry.isIntersecting)) {
                        moreObserver?.disconnect();
                        runtime.propose({ kind: "moreStories" });
                    }
                }, { rootMargin: "200px" });
                moreObserver.observe(more);
            }
        },
        perform: async (effect) => {
            if (effect.kind === "navigate") {
                location.assign(effect.href);
                return { kind: "navigated", id: effect.id };
            }
            return { kind: "finished", id: effect.id, result: await call({ path: effect.kind === "load" ? `/api/sales/snapshot?page=${page}` : `/api/sales/${effect.kind}`, ...(effect.kind === "load" ? {} : { body: effect.body }), parse: parsePublic }) };
        },
        failed: effect => effect.kind === "navigate" ? { kind: "navigated", id: effect.id } : { kind: "finished", id: effect.id, result: { ok: false, error: { code: "unavailable", message: "We couldn't save your request. Please try again." } } },
    });
    runtime.propose({ kind: "started" });
    return () => { moreObserver?.disconnect(); scope.abort(); runtime.dispose(); };
}
