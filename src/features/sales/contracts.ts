import { INITIAL_INSIGHTS } from "./insights.ts";
import type { Insight } from "./insights.ts";
import { FAQ_COPY } from "./faq-copy.ts";
import { isRecord, isText } from "../../shared/validation.ts";
import { APPLICATION_COPY } from "./application-copy.ts";
export const STAGES = ["free_value", "applied", "call_booked", "follow_up", "won", "lost"] as const;
export type Stage = typeof STAGES[number];
export const STAGE_LABELS: Readonly<Record<Stage, string>> = { free_value: "Free value", applied: "Applied", call_booked: "Call booked", follow_up: "Follow up", won: "Client", lost: "Closed" };
export const PUBLIC_PAGES = ["free-value", "apply", "book-call", "client-stories"] as const;
export type PublicPage = typeof PUBLIC_PAGES[number];
export type Faq = Readonly<{
    id: string;
    question: string;
    answer: string;
    videoUrl: string;
}>;
export type Story = Readonly<{
    id: string;
    name: string;
    title: string;
    body: string;
    imageUrl: string;
    videoUrl: string;
    published: boolean;
    consentConfirmed: boolean;
}>;
export type SalesSettings = Readonly<{
    freeTitle: string;
    freeIntro: string;
    freeVideo: string;
    resourceUrl: string;
    mentorVideo: string;
    bookingTitle: string;
    bookingIntro: string;
    caseTitle: string;
    caseIntro: string;
    insights: readonly Insight[];
    faqs: readonly Faq[];
    stories: readonly Story[];
    applicationCopy: Readonly<Record<string, string>>;
}>;
export const DEFAULT_SETTINGS: SalesSettings = {
    freeTitle: "30 Days, 30 Insights from a National Pull-up and Dip Champion.",
    freeIntro: "Match your body to your success. Practical insights on training, nutrition, mindset and recovery for founders and business owners. Build a clearer understanding of what deserves your time, what is holding you back and how to move forward.",
    freeVideo: "", resourceUrl: "", mentorVideo: "", bookingTitle: "Let's map out your next 180 days.",
    bookingIntro: "Choose a time for your call. Bring your goals, your questions and an honest picture of where you are now.",
    caseTitle: "The people behind the progress.", caseIntro: "Explore client experiences with Elite Body System.",
    faqs: FAQ_COPY.map((f, i) => ({ id: `faq-${i + 1}`, question: f.question, answer: f.answer, videoUrl: "" })),
    stories: [], insights: INITIAL_INSIGHTS, applicationCopy: APPLICATION_COPY,
};
export function safeUrl(value: unknown): value is string {
    if (!isText(value, 2000))
        return false;
    if (value === "")
        return true;
    if (value !== value.trim() || /[\u0000-\u0020]/.test(value))
        return false;
    try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password;
    }
    catch {
        return false;
    }
}
export function mediaSource(value: string): Readonly<{
    kind: "frame" | "video";
    url: string;
}> | undefined {
    if (!value || !safeUrl(value))
        return undefined;
    const u = new URL(value);
    const youtube = ["youtube.com", "www.youtube.com", "youtu.be", "www.youtube-nocookie.com"].includes(u.hostname)
        ? u.hostname === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v") ?? u.pathname.split("/").at(-1) : undefined;
    if (youtube && /^[A-Za-z0-9_-]{11}$/.test(youtube))
        return { kind: "frame", url: `https://www.youtube-nocookie.com/embed/${youtube}` };
    if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(u.hostname) && /^\d+$/.test(u.pathname.split("/").at(-1) ?? ""))
        return { kind: "frame", url: `https://player.vimeo.com/video/${u.pathname.split("/").at(-1)}` };
    if (/\.(mp4|webm)(?:$|\?)/i.test(value))
        return { kind: "video", url: value };
    return undefined;
}
export function parseSettings(value: unknown): SalesSettings | undefined {
    if (!isRecord(value))
        return;
    for (const key of ["freeTitle", "freeIntro", "bookingTitle", "bookingIntro", "caseTitle", "caseIntro"])
        if (!isText(value[key], 6000) || !(value[key] as string).trim())
            return;
    for (const key of ["freeVideo", "mentorVideo"])
        if (!safeUrl(value[key]) || value[key] !== "" && !mediaSource(value[key] as string))
            return;
    if (!safeUrl(value.resourceUrl) || !Array.isArray(value.faqs) || value.faqs.length > 30 || !Array.isArray(value.stories) || value.stories.length > 200 || !isRecord(value.applicationCopy))
        return;
    if (Object.keys(value.applicationCopy).length !== Object.keys(APPLICATION_COPY).length || Object.keys(APPLICATION_COPY).some(key => !isText((value.applicationCopy as Record<string, unknown>)[key], 6000)))
        return;
    const insights: Insight[] = [];
    const rawInsights = value.insights ?? INITIAL_INSIGHTS;
    if (!Array.isArray(rawInsights) || rawInsights.length !== 30)
        return;
    for (let i = 0; i < rawInsights.length; i++) {
        const item: unknown = rawInsights[i];
        if (!isRecord(item) || item.day !== i + 1 || !isText(item.title, 300) || !item.title.trim() || !isText(item.body, 6000) || !item.body.trim() || !isText(item.action, 2000) || !item.action.trim())
            return;
        insights.push({ day: i + 1, title: item.title, body: item.body, action: item.action });
    }
    const faqs: Faq[] = [], stories: Story[] = [];
    const ids = new Set<string>();
    for (const f of value.faqs) {
        if (!isRecord(f) || !isText(f.id, 80) || ids.has(f.id) || !isText(f.question, 500) || !f.question.trim() || !isText(f.answer, 6000) || !safeUrl(f.videoUrl) || f.videoUrl !== "" && !mediaSource(f.videoUrl))
            return;
        ids.add(f.id);
        faqs.push({ id: f.id, question: f.question, answer: f.answer, videoUrl: f.videoUrl });
    }
    for (const s of value.stories) {
        if (!isRecord(s) || !isText(s.id, 80) || ids.has(s.id) || !isText(s.name, 200) || !isText(s.title, 500) || !isText(s.body, 12000) || !safeUrl(s.imageUrl) || !safeUrl(s.videoUrl) || s.videoUrl !== "" && !mediaSource(s.videoUrl) || typeof s.published !== "boolean" || typeof s.consentConfirmed !== "boolean" || s.published && (!s.consentConfirmed || !s.name.trim() || !s.title.trim() || !s.body.trim()))
            return;
        ids.add(s.id);
        stories.push({ id: s.id, name: s.name, title: s.title, body: s.body, imageUrl: s.imageUrl, videoUrl: s.videoUrl, published: s.published, consentConfirmed: s.consentConfirmed });
    }
    return { insights, freeTitle: value.freeTitle as string, freeIntro: value.freeIntro as string, freeVideo: value.freeVideo as string, resourceUrl: value.resourceUrl, mentorVideo: value.mentorVideo as string, bookingTitle: value.bookingTitle as string, bookingIntro: value.bookingIntro as string, caseTitle: value.caseTitle as string, caseIntro: value.caseIntro as string, faqs, stories, applicationCopy: Object.fromEntries(Object.entries(value.applicationCopy).map(([k, v]) => [k, v as string])) };
}
export const APPLICATION_FIELDS = ["name", "email", "phone", "age", "role", "goal", "training", "obstacle", "invest"] as const;
export type Application = Readonly<Record<typeof APPLICATION_FIELDS[number], string>>;
export function parseApplication(value: unknown): Application | undefined {
    if (!isRecord(value) || APPLICATION_FIELDS.some(k => !isText(value[k], k === "obstacle" ? 6000 : 300) || k !== "phone" && !(value[k] as string).trim()))
        return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.email as string))
        return;
    return Object.fromEntries(APPLICATION_FIELDS.map(k => [k, (value[k] as string).trim()])) as Application;
}
export type Slot = Readonly<{
    id: string;
    startsAt: string;
    endsAt: string;
    booked: boolean;
}>;
export type Booking = Readonly<{
    id: string;
    startsAt: string;
    endsAt: string;
    meetingUrl: string;
}>;
export type Lead = Readonly<{
    id: string;
    name: string;
    email: string;
    phone: string;
    stage: Stage;
    application: Readonly<Record<string, string>>;
    notes: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
    source: string;
    insightsSubscribed: boolean;
    booking: Booking | null;
}>;
export type JourneyEvent = Readonly<{
    id: string;
    kind: string;
    detail: string;
    createdAt: string;
}>;
export type CallScriptPart = Readonly<{
    step: string;
    title: string;
    prompt: string;
    questions: readonly string[];
    note: string;
}>;
export type ManagementSnapshot = Readonly<{
    settings: SalesSettings;
    revision: number;
    callScript: readonly CallScriptPart[];
    mentorIntroScript: string;
    leads: readonly Lead[];
    hasMore: boolean;
    counts: Readonly<Record<Stage, number>>;
    visits: Readonly<Record<PublicPage, number>>;
    slots: readonly Slot[];
}>;
export type PublicSnapshot = Readonly<{
    settings: SalesSettings;
    applied: boolean;
    identified: boolean;
    subscribed: boolean;
    booking: Booking | null;
    slots: readonly Slot[];
}>;
function isDate(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function parseBooking(v: unknown): Booking | undefined {
    if (isRecord(v) && isText(v.id, 80) && isDate(v.startsAt) && isDate(v.endsAt) && safeUrl(v.meetingUrl))
        return { id: v.id, startsAt: v.startsAt, endsAt: v.endsAt, meetingUrl: v.meetingUrl };
}
function parseSlots(v: unknown): readonly Slot[] | undefined {
    if (!Array.isArray(v))
        return;
    const result: Slot[] = [];
    for (const s of v) {
        if (!isRecord(s) || !isText(s.id, 80) || !isDate(s.startsAt) || !isDate(s.endsAt) || typeof s.booked !== "boolean")
            return;
        result.push({ id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, booked: s.booked });
    }
    return result;
}
export function parsePublic(v: unknown): PublicSnapshot | undefined {
    if (!isRecord(v))
        return;
    const settings = parseSettings(v.settings), slots = parseSlots(v.slots), booking = v.booking === null ? null : parseBooking(v.booking);
    if (settings && slots && booking !== undefined && typeof v.applied === "boolean" && typeof v.identified === "boolean" && typeof v.subscribed === "boolean")
        return { settings, slots, booking, applied: v.applied, identified: v.identified, subscribed: v.subscribed };
}
export function parseManagement(v: unknown): ManagementSnapshot | undefined {
    if (!isRecord(v))
        return;
    const settings = parseSettings(v.settings), slots = parseSlots(v.slots);
    if (!Array.isArray(v.callScript) || !isText(v.mentorIntroScript, 10000))
        return;
    const callScript: CallScriptPart[] = [];
    for (const part of v.callScript) {
        if (!isRecord(part) || !isText(part.step, 2) || !isText(part.title, 500) || !isText(part.prompt, 6000) || !isText(part.note, 6000) || !Array.isArray(part.questions) || part.questions.length > 12 || !part.questions.every(q => isText(q, 1000)))
            return;
        callScript.push({ step: part.step, title: part.title, prompt: part.prompt, note: part.note, questions: part.questions as string[] });
    }
    if (!settings || !slots || !Number.isSafeInteger(v.revision) || typeof v.hasMore !== "boolean" || !Array.isArray(v.leads) || !isRecord(v.counts) || !isRecord(v.visits))
        return;
    if (STAGES.some(k => typeof (v.counts as Record<string, unknown>)[k] !== "number") || PUBLIC_PAGES.some(k => typeof (v.visits as Record<string, unknown>)[k] !== "number"))
        return;
    const leads: Lead[] = [];
    for (const l of v.leads) {
        if (!isRecord(l) || !isText(l.id, 80) || !isText(l.name, 300) || !isText(l.email, 300) || !isText(l.phone, 300) || !STAGES.includes(l.stage as Stage) || !isRecord(l.application) || Object.values(l.application).some(x => !isText(x, 6000)) || !isText(l.notes, 12000) || !Number.isSafeInteger(l.revision) || !isDate(l.createdAt) || !isDate(l.updatedAt) || !isText(l.source, 300) || typeof l.insightsSubscribed !== "boolean")
            return;
        const booking = l.booking === null ? null : parseBooking(l.booking);
        if (booking === undefined)
            return;
        leads.push({ id: l.id, name: l.name, email: l.email, phone: l.phone, stage: l.stage as Stage, application: l.application as Readonly<Record<string, string>>, notes: l.notes, revision: l.revision as number, createdAt: l.createdAt, updatedAt: l.updatedAt, source: l.source, insightsSubscribed: l.insightsSubscribed, booking });
    }
    return { settings, slots, leads, callScript, mentorIntroScript: v.mentorIntroScript, revision: v.revision as number, hasMore: v.hasMore, counts: v.counts as Record<Stage, number>, visits: v.visits as Record<PublicPage, number> };
}
export function parseJourney(v: unknown): readonly JourneyEvent[] | undefined {
    if (!Array.isArray(v))
        return;
    const result: JourneyEvent[] = [];
    for (const e of v) {
        if (!isRecord(e) || !isText(e.id, 80) || !isText(e.kind, 80) || !isText(e.detail, 12000) || !isDate(e.createdAt))
            return;
        result.push({ id: e.id, kind: e.kind, detail: e.detail, createdAt: e.createdAt });
    }
    return result;
}
