import type { ClientResult } from "../../shared/client-result.ts";
import type { NavigationGuard } from "../../shared/browser-route.ts";
import { emptyArticle, QUESTIONS } from "./data.ts";
import type { AnswerKey, Article, MarketingSnapshot, Topic } from "./data.ts";
export type Step = "subject" | "interview" | "draft";
export type MarketingEffect = Readonly<{
    id: number;
}> & (Readonly<{
    kind: "load";
    before: string;
}> | Readonly<{
    kind: "save";
    article: Article;
    build: boolean;
}> | Readonly<{
    kind: "research";
    query: string;
}> | Readonly<{
    kind: "voice";
    key: AnswerKey;
    uploadId: string;
}> | Readonly<{
    kind: "recordStart";
    key: AnswerKey;
}> | Readonly<{
    kind: "recordStop";
    key: AnswerKey;
}> | Readonly<{
    kind: "discardVoice";
    uploadId: string;
}> | Readonly<{
    kind: "download";
    article: Article;
    format: "markdown" | "html";
}>);
export type MarketingModel = Readonly<{
    snapshot: MarketingSnapshot | null;
    article: Article | null;
    dirty: boolean;
    step: Step;
    question: number;
    query: string;
    topics: readonly Topic[];
    recording: AnswerKey | null;
    voiceRetry: Readonly<{
        key: AnswerKey;
        uploadId: string;
    }> | null;
    serial: number;
    pending: MarketingEffect | undefined;
    error: string;
    notice: string;
}>;
export type MarketingProposal = Readonly<{
    kind: "retryVoice";
}> | Readonly<{
    kind: "discardVoice";
}> | Readonly<{
    kind: "voiceDiscarded";
    id: number;
}> | Readonly<{
    kind: "start";
}> | Readonly<{
    kind: "older";
}> | Readonly<{
    kind: "new";
    id: string;
}> | Readonly<{
    kind: "select";
    id: string;
}> | Readonly<{
    kind: "edit";
    article: Article;
}> | Readonly<{
    kind: "step";
    step: Step;
}> | Readonly<{
    kind: "question";
    index: number;
}> | Readonly<{
    kind: "query";
    text: string;
}> | Readonly<{
    kind: "research";
}> | Readonly<{
    kind: "topic";
    topic: Topic;
}> | Readonly<{
    kind: "save";
    build: boolean;
}> | Readonly<{
    kind: "voice";
    key: AnswerKey;
    uploadId: string;
}> | Readonly<{
    kind: "recordStart";
    key: AnswerKey;
}> | Readonly<{
    kind: "recordStop";
}> | Readonly<{
    kind: "download";
    format: "markdown" | "html";
}> | Readonly<{
    kind: "loaded";
    id: number;
    result: ClientResult<MarketingSnapshot>;
}> | Readonly<{
    kind: "saved";
    id: number;
    result: ClientResult<Article>;
}> | Readonly<{
    kind: "researched";
    id: number;
    result: ClientResult<readonly Topic[]>;
}> | Readonly<{
    kind: "recordStarted";
    id: number;
    result: ClientResult<Readonly<{
        started: true;
    }>>;
}> | Readonly<{
    kind: "voiced";
    id: number;
    retryUploadId?: string;
    result: ClientResult<Readonly<{
        text: string;
    }>>;
}> | Readonly<{
    kind: "downloaded";
    id: number;
    result: ClientResult<Readonly<{
        downloaded: true;
    }>>;
}>;
export const initialMarketing = (): MarketingModel => ({ snapshot: null, article: null, dirty: false, step: "subject", question: 0, query: "", topics: [], recording: null, voiceRetry: null, serial: 0, pending: undefined, error: "", notice: "" });
type NewEffect = MarketingEffect extends infer E ? E extends MarketingEffect ? Omit<E, "id"> : never : never;
function effect(m: MarketingModel, e: NewEffect): MarketingModel { return { ...m, serial: m.serial + 1, pending: { ...e, id: m.serial + 1 }, error: "", notice: "" }; }
export function acceptMarketing(m: MarketingModel, p: MarketingProposal): MarketingModel {
    if ("id" in p && typeof p.id === "number") {
        if (!m.pending || m.pending.id !== p.id)
            return m;
        const replies: Readonly<Record<MarketingEffect["kind"], MarketingProposal["kind"]>> = { load: "loaded", save: "saved", research: "researched", voice: "voiced", recordStart: "recordStarted", recordStop: "voiced", download: "downloaded", discardVoice: "voiceDiscarded" };
        if (replies[m.pending.kind] !== p.kind)
            return m;
        if (p.kind === "voiceDiscarded")
            return { ...m, voiceRetry: null, pending: undefined, notice: "Voice note discarded." };
        if (p.kind === "loaded")
            return p.result.ok ? { ...m, snapshot: m.pending.kind === "load" && m.pending.before && m.snapshot ? { ...p.result.value, articles: [...m.snapshot.articles, ...p.result.value.articles.filter(a => !m.snapshot!.articles.some(prior => prior.id === a.id))] } : p.result.value, pending: undefined, error: "" } : { ...m, pending: undefined, error: p.result.error.message };
        if (p.kind === "saved") {
            if (!p.result.ok)
                return { ...m, pending: undefined, error: p.result.error.message };
            const saved = p.result.value;
            const articles = [saved, ...(m.snapshot?.articles ?? []).filter(a => a.id !== saved.id)];
            return { ...m, article: p.result.value, snapshot: m.snapshot ? { ...m.snapshot, articles } : null, dirty: false, step: m.pending.kind === "save" && m.pending.build ? "draft" : m.step, pending: undefined, notice: "Saved.", error: "" };
        }
        if (p.kind === "researched")
            return p.result.ok ? { ...m, topics: p.result.value, pending: undefined, notice: p.result.value.length ? "Recent videos, ordered by average views per day. Choose one for relevance." : "No matching videos. Try another subject or add a source manually." } : { ...m, pending: undefined, error: p.result.error.message };
        if (p.kind === "recordStarted")
            return p.result.ok && m.pending.kind === "recordStart" ? { ...m, recording: m.pending.key, pending: undefined, notice: "Recording. Keep each answer to two minutes." } : { ...m, pending: undefined, error: p.result.ok ? "Recording did not start." : p.result.error.message };
        if (p.kind === "voiced") {
            const key = m.pending.kind === "voice" || m.pending.kind === "recordStop" ? m.pending.key : undefined;
            return p.result.ok && m.article && key ? { ...m, article: { ...m.article, answers: { ...m.article.answers, [key]: [m.article.answers[key], p.result.value.text].filter(Boolean).join("\n\n") } }, dirty: true, recording: null, voiceRetry: null, pending: undefined, notice: "Transcript added. Read it through and correct anything before building." } : { ...m, recording: null, voiceRetry: key && p.retryUploadId ? { key, uploadId: p.retryUploadId } : null, pending: undefined, error: p.result.ok ? "Choose an interview question first." : p.result.error.message };
        }
        if (p.kind === "downloaded")
            return { ...m, pending: undefined, ...(p.result.ok ? { notice: "Export prepared. Your saved draft stays in Marketing." } : { error: p.result.error.message }) };
        return m;
    }
    if (m.pending)
        return m;
    if (p.kind === "recordStop")
        return m.recording ? effect(m, { kind: "recordStop", key: m.recording }) : m;
    if (m.recording)
        return m;
    if (p.kind === "retryVoice")
        return m.voiceRetry ? effect(m, { kind: "voice", ...m.voiceRetry }) : m;
    if (p.kind === "discardVoice")
        return m.voiceRetry ? effect(m, { kind: "discardVoice", uploadId: m.voiceRetry.uploadId }) : m;
    if (m.voiceRetry && ["new", "select", "voice", "recordStart", "start"].includes(p.kind))
        return { ...m, error: "Retry or discard the pending voice note first." };
    if (p.kind === "start")
        return m.dirty ? { ...m, error: "Save your draft before refreshing." } : effect(m, { kind: "load", before: "" });
    if (p.kind === "older")
        return m.dirty ? { ...m, error: "Save your draft before loading more articles." } : m.snapshot?.nextCursor ? effect(m, { kind: "load", before: m.snapshot.nextCursor }) : m;
    if (p.kind === "new" || p.kind === "select") {
        if (m.dirty)
            return { ...m, error: "Save your current draft before opening another." };
        const article = p.kind === "new" ? emptyArticle(p.id) : m.snapshot?.articles.find(a => a.id === p.id);
        return article ? { ...m, article, dirty: p.kind === "new", step: "subject", question: 0, topics: [], error: "", notice: "" } : m;
    }
    if (p.kind === "edit")
        return m.article && p.article.id === m.article.id ? { ...m, article: p.article, dirty: true, notice: "" } : m;
    if (p.kind === "step")
        return { ...m, step: p.step, error: "" };
    if (p.kind === "question")
        return Number.isSafeInteger(p.index) && p.index >= 0 && p.index < QUESTIONS.length ? { ...m, question: p.index } : m;
    if (p.kind === "query")
        return { ...m, query: p.text };
    if (p.kind === "research")
        return m.query.trim() ? effect(m, { kind: "research", query: m.query }) : { ...m, error: "Enter a subject to research." };
    if (p.kind === "topic")
        return m.article ? { ...m, article: { ...m.article, sourceUrl: p.topic.url, sourceTitle: p.topic.title, title: m.article.title || p.topic.title }, dirty: true, notice: "Source selected. Explain why it matters to your client." } : m;
    if (p.kind === "save")
        return m.article ? effect(m, { kind: "save", article: m.article, build: p.build }) : m;
    if (p.kind === "voice")
        return m.article ? effect(m, { kind: "voice", key: p.key, uploadId: p.uploadId }) : m;
    if (p.kind === "recordStart")
        return m.article ? effect(m, { kind: "recordStart", key: p.key }) : m;
    if (p.kind === "download")
        return m.article?.blog.trim() ? effect(m, { kind: "download", article: m.article, format: p.format }) : { ...m, error: "Build your blog and script first." };
    return m;
}
export function marketingNavigation(m: MarketingModel): NavigationGuard {
    return m.recording || m.pending ? { kind: "blocked", message: m.recording ? "Stop your voice recording before leaving." : "Finishing this marketing action…" } : m.dirty || m.voiceRetry ? { kind: "confirm", message: "Leave this article? Your unsaved changes will be lost." } : { kind: "ready" };
}
