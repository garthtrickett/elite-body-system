import { isRecord, isText } from "../../shared/validation.ts";
export const CTA = "30 Days, 30 Insights from a National Pull-up and Dip Champion. Match your body to your success.";
export const CLIENT_LENS = "Founders, business owners and leaders who hold high professional standards but feel their physique, strength or energy no longer matches their success. They value a clear system, credible proof and efficient use of time. Work, travel and family matter. They want sustainable capability and confidence.";
export const SEED_TOPICS = ["Why more effort isn’t fixing your fitness", "A training plan that survives a busy week", "What your afternoon energy dip is telling you about your routine", "Building strength after 40 without chasing every trend", "How to stop restarting your nutrition every Monday"] as const;
export const QUESTIONS = [
    { key: "problem", label: "What problem does this topic solve?", hint: "Describe a real moment your client recognises: a busy week, low energy, stalled training or an approach that keeps breaking down." },
    { key: "experience", label: "Where have you seen this personally or with clients?", hint: "Tell the story in your own words. What happened? What did you try? What surprised you? Avoid identifying a client without permission." },
    { key: "mistake", label: "What is the important mistake or misconception?", hint: "What do people assume about this topic, and what have you actually observed? Be specific rather than provocative." },
    { key: "solution", label: "What is your methodical solution?", hint: "Give up to three practical steps. Explain the problem each step solves and how it fits a demanding week." },
    { key: "proof", label: "What result or story proves your point?", hint: "Give a real client or personal example: starting point, action, timeframe and observable change. Include only results you can substantiate. A clear lesson from a real story is useful too." },
    { key: "action", label: "What should the reader do next?", hint: "One clear action they can take now. Finish by inviting them to 30 Days, 30 Insights: Match your body to your success." },
] as const;
export type AnswerKey = typeof QUESTIONS[number]["key"];
export type Article = Readonly<{
    id: string;
    revision: number;
    title: string;
    sourceUrl: string;
    sourceTitle: string;
    angle: string;
    clientLens: string;
    answers: Readonly<Record<AnswerKey, string>>;
    blog: string;
    script: string;
    images: readonly Readonly<{
        url: string;
        caption: string;
    }>[];
    updatedAt: string;
}>;
export type Topic = Readonly<{
    id: string;
    title: string;
    url: string;
    channel: string;
    publishedAt: string;
    views: number;
    viewsPerDay: number;
}>;
export type MarketingSnapshot = Readonly<{
    articles: readonly Article[];
    youtubeAvailable: boolean;
    voiceAvailable: boolean;
    nextCursor: string | null;
}>;
export const emptyArticle = (id: string): Article => ({ id, revision: 0, title: "", sourceUrl: "", sourceTitle: "", angle: "", clientLens: CLIENT_LENS, answers: { problem: "", experience: "", mistake: "", solution: "", proof: "", action: "" }, blog: "", script: "", images: [], updatedAt: "" });
export function validYoutube(url: unknown): url is string {
    if (!isText(url, 2000))
        return false;
    if (!url)
        return true;
    try {
        const u = new URL(url);
        return u.protocol === "https:" && !u.username && !u.password && ["www.youtube.com", "youtube.com", "youtu.be"].includes(u.hostname) && (u.hostname === "youtu.be" ? /^\/[A-Za-z0-9_-]{11}$/.test(u.pathname) : /^[A-Za-z0-9_-]{11}$/.test(u.searchParams.get("v") ?? ""));
    }
    catch {
        return false;
    }
}
export function parseArticle(v: unknown): Article | undefined {
    if (!isRecord(v) || !isText(v.id, 80) || (!Number.isSafeInteger(v.revision) || (v.revision as number) < 0) || !isText(v.title, 300) || !validYoutube(v.sourceUrl) || !isText(v.sourceTitle, 500) || !isText(v.angle, 3000) || !isText(v.clientLens, 5000) || !isRecord(v.answers) || QUESTIONS.some(q => !isText((v.answers as Record<string, unknown>)[q.key], 24000)) || !isText(v.blog, 60000) || !isText(v.script, 60000) || !Array.isArray(v.images) || v.images.length > 8 || !isText(v.updatedAt, 80))
        return;
    const images: {
        url: string;
        caption: string;
    }[] = [];
    for (const image of v.images) {
        if (!isRecord(image) || !isText(image.url, 2000) || !isText(image.caption, 500))
            return;
        try {
            const u = new URL(image.url);
            if (image.url !== image.url.trim() || /[\u0000-\u0020]/.test(image.url) || u.protocol !== "https:" || u.username || u.password)
                return;
        }
        catch {
            return;
        }
        images.push({ url: image.url, caption: image.caption });
    }
    return { id: v.id, revision: v.revision as number, title: v.title, sourceUrl: v.sourceUrl, sourceTitle: v.sourceTitle, angle: v.angle, clientLens: v.clientLens, answers: Object.fromEntries(QUESTIONS.map(q => [q.key, (v.answers as Record<string, unknown>)[q.key] as string])) as Record<AnswerKey, string>, blog: v.blog, script: v.script, images, updatedAt: v.updatedAt };
}
export function parseMarketing(v: unknown): MarketingSnapshot | undefined {
    if (!isRecord(v) || !Array.isArray(v.articles) || typeof v.youtubeAvailable !== "boolean" || typeof v.voiceAvailable !== "boolean" || !(v.nextCursor === null || isText(v.nextCursor, 80)))
        return;
    const articles: Article[] = [];
    for (const x of v.articles) {
        const a = parseArticle(x);
        if (!a)
            return;
        articles.push(a);
    }
    return { articles, youtubeAvailable: v.youtubeAvailable, voiceAvailable: v.voiceAvailable, nextCursor: v.nextCursor };
}
export function parseTopics(v: unknown): readonly Topic[] | undefined {
    if (!Array.isArray(v))
        return;
    const topics: Topic[] = [];
    for (const t of v) {
        if (!isRecord(t) || !isText(t.id, 80) || !isText(t.title, 500) || (!validYoutube(t.url) || !t.url) || !isText(t.channel, 500) || !isText(t.publishedAt, 80) || typeof t.views !== "number" || !Number.isFinite(t.views) || t.views < 0 || typeof t.viewsPerDay !== "number" || !Number.isFinite(t.viewsPerDay) || t.viewsPerDay < 0)
            return;
        topics.push({ id: t.id, title: t.title, url: t.url, channel: t.channel, publishedAt: t.publishedAt, views: t.views, viewsPerDay: t.viewsPerDay });
    }
    return topics;
}
export function buildDraft(a: Article): Article {
    const x = a.answers;
    const blog = [`# ${a.title}`, x.problem, `## What I’ve seen`, x.experience, `## The mistake`, x.mistake, `## A better approach`, x.solution, `## What changed`, x.proof, `## Your next step`, x.action, `### Match your body to your success`, CTA, `[Sign up to 30 Days, 30 Insights](/free-value)`].join("\n\n");
    const script = [a.title, "OPEN", x.problem, "PERSONAL / CLIENT EXPERIENCE", x.experience, "THE MISCONCEPTION", x.mistake, "THE SYSTEM — PRACTICAL STEPS", x.solution, "THE PROOF", x.proof, "ONE ACTION", x.action, "CLOSE", CTA, "The sign-up link is in the description."].join("\n\n");
    return { ...a, blog, script };
}
export function notionMarkdown(a: Article, origin: string): string { return a.blog.replaceAll("](/free-value)", `](${origin}/free-value)`) + "\n\n" + a.images.map(i => `![${i.caption.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]")}](${"<" + new URL(i.url).href.replaceAll(">", "%3E") + ">"})\n\n${i.caption}`).join("\n\n") + "\n\n---\n\n## YouTube script\n\n" + a.script + (a.sourceUrl ? `\n\nResearch source: ${a.sourceTitle}\n${a.sourceUrl}` : ""); }
