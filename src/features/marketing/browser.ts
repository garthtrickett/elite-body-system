import { render } from "lit-html";
import { createSamRuntime } from "../../shared/sam-runtime.ts";
import { createClientTransport } from "../../shared/browser-http.ts";
import { isRecord, isText } from "../../shared/validation.ts";
import type { RouteHost } from "../../shared/browser-route.ts";
import type { ClientResult } from "../../shared/client-result.ts";
import { parseArticle, parseMarketing, parseTopics, notionMarkdown } from "./data.ts";
import { brandedDocument } from "./export.ts";
import { acceptMarketing, initialMarketing, marketingNavigation } from "./browser-model.ts";
import type { MarketingModel, MarketingProposal, MarketingEffect } from "./browser-model.ts";
import { marketingView } from "./browser-view.ts";
const unavailable = (message: string): ClientResult<never> => ({ ok: false, error: { code: "unavailable", message } });
export function mountMarketing(root: HTMLElement, config: RouteHost & Readonly<{
    csrf: string;
}>) {
    const scope = new AbortController(), call = createClientTransport({ csrf: config.csrf, send: fetch, signal: scope.signal });
    const uploads = new Map<string, File>();
    let recorder: MediaRecorder | undefined, stream: MediaStream | undefined, timer: number | undefined;
    let chunks: Blob[] = [], audioSize = 0, disposed = false;
    const release = () => { window.clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); stream = undefined; recorder = undefined; chunks = []; audioSize = 0; };
    async function transcribe(blob: Blob): Promise<ClientResult<Readonly<{
        text: string;
    }>>> {
        if (!blob.size || blob.size > 8 * 1024 * 1024)
            return { ok: false, error: { code: "invalid_input", message: "Choose a voice note under 8 MB." } };
        const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("Audio unavailable")); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result.slice(reader.result.indexOf(",") + 1)) : reject(new Error("Invalid audio")); reader.readAsDataURL(blob); });
        return call({ path: "/api/marketing/voice", body: { base64, mediaType: blob.type || "audio/mp4" }, timeout: 75000, parse: v => isRecord(v) && isText(v.text, 24000) ? { text: v.text } : undefined });
    }
    const runtime = createSamRuntime<MarketingModel, MarketingProposal, MarketingModel, MarketingEffect>({
        initial: initialMarketing(), accept: acceptMarketing, represent: m => m, next: m => m.pending,
        present: state => {
            render(marketingView({ state, propose: p => runtime.propose(p), create: () => runtime.propose({ kind: "new", id: crypto.randomUUID() }), upload: (key, file) => {
                    const id = crypto.randomUUID();
                    uploads.set(id, file);
                    runtime.propose({ kind: "voice", key, uploadId: id });
                    if (runtime.getModel().pending?.kind !== "voice")
                        uploads.delete(id);
                } }), root);
            config.navigationChanged(marketingNavigation(state));
        },
        perform: async (e) => {
            if (e.kind === "load")
                return { kind: "loaded", id: e.id, result: await call({ path: `/api/marketing/snapshot?before=${encodeURIComponent(e.before)}`, parse: parseMarketing }) };
            if (e.kind === "save")
                return { kind: "saved", id: e.id, result: await call({ path: "/api/marketing/save", body: { article: e.article, build: e.build }, parse: parseArticle }) };
            if (e.kind === "research")
                return { kind: "researched", id: e.id, result: await call({ path: "/api/marketing/research", body: { query: e.query }, timeout: 40000, parse: parseTopics }) };
            if (e.kind === "voice") {
                const file = uploads.get(e.uploadId);
                uploads.delete(e.uploadId);
                return { kind: "voiced", id: e.id, result: file ? await transcribe(file) : unavailable("Choose your voice note again.") };
            }
            if (e.kind === "recordStart") {
                try {
                    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
                        throw new Error("Unsupported recorder");
                    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    if (disposed) {
                        release();
                        return { kind: "recordStarted", id: e.id, result: unavailable("Recording stopped.") };
                    }
                    const mediaType = ["audio/webm", "audio/mp4", "audio/ogg"].find(t => MediaRecorder.isTypeSupported(t));
                    recorder = new MediaRecorder(stream, mediaType ? { mimeType: mediaType } : undefined);
                    chunks = [];
                    audioSize = 0;
                    recorder.ondataavailable = event => {
                        if (event.data.size) {
                            chunks.push(event.data);
                            audioSize += event.data.size;
                            if (audioSize > 7 * 1024 * 1024 && runtime.getModel().recording)
                                runtime.propose({ kind: "recordStop" });
                        }
                    };
                    recorder.start(1000);
                    timer = window.setTimeout(() => runtime.propose({ kind: "recordStop" }), 120000);
                    return { kind: "recordStarted", id: e.id, result: { ok: true, value: { started: true } } };
                }
                catch {
                    release();
                    return { kind: "recordStarted", id: e.id, result: unavailable("Your microphone could not be opened. Allow microphone access, upload a voice note, or type your answer.") };
                }
            }
            if (e.kind === "recordStop") {
                const active = recorder;
                if (!active || active.state === "inactive") {
                    release();
                    return { kind: "voiced", id: e.id, result: unavailable("No recording was available. Please try again or upload a voice note.") };
                }
                const blob = await new Promise<Blob>((resolve, reject) => { active.onerror = () => reject(new Error("Recording interrupted")); active.onstop = () => { const result = new Blob(chunks, { type: active.mimeType }); release(); resolve(result); }; active.stop(); });
                return { kind: "voiced", id: e.id, result: await transcribe(blob) };
            }
            const content = e.format === "markdown" ? notionMarkdown(e.article, location.origin) : brandedDocument({ article: e.article, origin: location.origin });
            const blob = new Blob([content], { type: e.format === "markdown" ? "text/markdown;charset=utf-8" : "text/html;charset=utf-8" });
            const url = URL.createObjectURL(blob), a = document.createElement("a");
            a.href = url;
            a.download = `ebs-${e.article.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 70) || "article"}.${e.format === "markdown" ? "md" : "html"}`;
            a.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            return { kind: "downloaded", id: e.id, result: { ok: true, value: { downloaded: true } } };
        },
        failed: e => {
            if (e.kind === "recordStart" || e.kind === "recordStop")
                release();
            const result = unavailable("This marketing action could not finish. Your current answers are still on this page.");
            return e.kind === "load" ? { kind: "loaded", id: e.id, result } : e.kind === "save" ? { kind: "saved", id: e.id, result } : e.kind === "research" ? { kind: "researched", id: e.id, result } : e.kind === "recordStart" ? { kind: "recordStarted", id: e.id, result } : e.kind === "recordStop" || e.kind === "voice" ? { kind: "voiced", id: e.id, result } : { kind: "downloaded", id: e.id, result };
        },
    });
    const protect = (e: BeforeUnloadEvent) => {
        if (marketingNavigation(runtime.getModel()).kind !== "ready") {
            e.preventDefault();
            e.returnValue = "";
        }
    };
    window.addEventListener("beforeunload", protect);
    runtime.propose({ kind: "start" });
    return { navigation: () => marketingNavigation(runtime.getModel()), dispose: () => {
            disposed = true;
            scope.abort();
            if (recorder?.state === "recording")
                recorder.stop();
            release();
            uploads.clear();
            runtime.dispose();
            window.removeEventListener("beforeunload", protect);
        }, revisit: () => {
            if (marketingNavigation(runtime.getModel()).kind === "ready")
                runtime.propose({ kind: "start" });
        } };
}
