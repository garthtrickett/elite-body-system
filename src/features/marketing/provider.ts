import { isRecord, isText } from "../../shared/validation.ts";
import type { ClientResult } from "../../shared/client-result.ts";
import type { Topic } from "./data.ts";
import { retryDelay } from "./pacing.ts";
export function createMarketingProviders(config: Readonly<{
    openAiApiKey?: string;
    youtubeApiKey?: string;
    send?: typeof fetch;
    now?: () => number;
}>) {
    const send = config.send ?? fetch, now = config.now ?? Date.now;
    let pausedUntil = 0;
    const throttled = () => ({ ok: false as const, error: { code: "rate_limited" as const, message: "The provider asked us to pause. Please try again later; your draft is safe." } });
    const pause = (r: Response) => {
        if (r.status === 429) {
            pausedUntil = now() + retryDelay(r.headers.get("retry-after"), now());
            return true;
        }
        return false;
    };
    return {
        youtubeAvailable: !!config.youtubeApiKey, voiceAvailable: !!config.openAiApiKey,
        async research(input: Readonly<{
            query: string;
        }>): Promise<ClientResult<readonly Topic[]>> {
            if (now() < pausedUntil)
                return throttled();
            if (!config.youtubeApiKey)
                return { ok: false, error: { code: "not_configured", message: "YouTube research is not connected. Add a YouTube source manually for now." } };
            try {
                const query = new URLSearchParams({ part: "snippet", type: "video", maxResults: "12", order: "viewCount", publishedAfter: new Date(now() - 90 * 86400000).toISOString(), q: input.query, key: config.youtubeApiKey });
                const search = await send(`https://www.googleapis.com/youtube/v3/search?${query}`, { signal: AbortSignal.timeout(15000), redirect: "error" });
                if (pause(search))
                    return throttled();
                const found: unknown = await search.json();
                if (!search.ok || !isRecord(found) || !Array.isArray(found.items))
                    throw new Error("Research unavailable");
                const ids = found.items.flatMap(i => isRecord(i) && isRecord(i.id) && isText(i.id.videoId, 20) ? [i.id.videoId] : []);
                if (!ids.length)
                    return { ok: true, value: [] };
                const details = await send(`https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({ part: "snippet,statistics", id: ids.join(","), key: config.youtubeApiKey })}`, { signal: AbortSignal.timeout(15000), redirect: "error" });
                if (pause(details))
                    return throttled();
                const value: unknown = await details.json();
                if (!details.ok || !isRecord(value) || !Array.isArray(value.items))
                    throw new Error("Research unavailable");
                const topics: Topic[] = [];
                for (const t of value.items)
                    if (isRecord(t) && isText(t.id, 20) && /^[A-Za-z0-9_-]{11}$/.test(t.id) && isRecord(t.snippet) && isRecord(t.statistics) && isText(t.snippet.title, 500) && isText(t.snippet.channelTitle, 500) && isText(t.snippet.publishedAt, 80)) {
                        const views = Number(t.statistics.viewCount), days = Math.max(1, (now() - Date.parse(t.snippet.publishedAt)) / 86400000);
                        if (Number.isFinite(views) && Number.isFinite(days))
                            topics.push({ id: t.id, title: t.snippet.title, url: `https://www.youtube.com/watch?v=${t.id}`, channel: t.snippet.channelTitle, publishedAt: t.snippet.publishedAt, views, viewsPerDay: Math.round(views / days) });
                    }
                return { ok: true, value: topics.sort((a, b) => b.viewsPerDay - a.viewsPerDay) };
            }
            catch {
                return { ok: false, error: { code: "unavailable", message: "YouTube research could not finish. Try again or add a source manually." } };
            }
        },
        async transcribe(input: Readonly<{
            base64: string;
            mediaType: string;
        }>): Promise<ClientResult<Readonly<{
            text: string;
        }>>> {
            if (now() < pausedUntil)
                return throttled();
            if (!config.openAiApiKey)
                return { ok: false, error: { code: "not_configured", message: "Voice transcription is not connected in this environment. You can type or paste your answer." } };
            const types: Readonly<Record<string, string>> = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg" };
            const extension = types[input.mediaType.split(";")[0] ?? ""];
            if (!extension || input.base64.length > 12 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64))
                return { ok: false, error: { code: "invalid_input", message: "Choose an audio note under 8 MB (WebM, M4A, MP3, WAV or OGG)." } };
            const bytes = Buffer.from(input.base64, "base64");
            if (bytes.length > 8 * 1024 * 1024)
                return { ok: false, error: { code: "invalid_input", message: "Voice notes must be under 8 MB." } };
            try {
                const form = new FormData();
                form.append("file", new Blob([bytes], { type: input.mediaType }), `voice-note.${extension}`);
                form.append("model", "gpt-transcribe");
                form.append("prompt", "Elite Body System by Harry Baldwin. Training, nutrition, mindset, recovery. Transcribe the speaker's experience faithfully.");
                const response = await send("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${config.openAiApiKey}` }, body: form, redirect: "error", signal: AbortSignal.timeout(60000) });
                if (pause(response))
                    return throttled();
                const value: unknown = await response.json();
                if (!response.ok || !isRecord(value) || !isText(value.text, 24000) || !value.text.trim())
                    throw new Error("No transcript");
                return { ok: true, value: { text: value.text } };
            }
            catch {
                return { ok: false, error: { code: "unavailable", message: "This voice note could not be transcribed. Try again or paste its transcript." } };
            }
        },
    };
}
