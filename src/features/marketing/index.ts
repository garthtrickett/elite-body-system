import { sql } from "kysely";
import type { Kysely } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
import type { MarketingArticlesId } from "../../platform/database/generated/public/MarketingArticles.ts";
import type { ClientResult } from "../../shared/client-result.ts";
import { managerAccess } from "../access/index.ts";
import { isText } from "../../shared/validation.ts";
import { buildDraft, parseArticle, QUESTIONS } from "./data.ts";
import type { Article, MarketingSnapshot, Topic } from "./data.ts";
import { createMarketingProviders } from "./provider.ts";
import { createProviderPacing } from "./pacing.ts";
const failure = (code: "forbidden" | "invalid_input" | "conflict" | "unavailable" | "not_found", message: string) => ({ ok: false as const, error: { code, message } });
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export function createMarketing(config: Readonly<{
    db: Kysely<Database>;
    openAiApiKey?: string;
    youtubeApiKey?: string;
    requestsPerMinute?: number;
}>) {
    const db = config.db, provider = createMarketingProviders(config);
    const protect = async <T>(actorId: string, fn: () => Promise<ClientResult<T>>): Promise<ClientResult<T>> => {
        try {
            if (!await managerAccess({ db, actorId }))
                return failure("forbidden", "Business manager access is required.");
            return await fn();
        }
        catch {
            return failure("unavailable", "Your marketing workspace could not be loaded or saved.");
        }
    };
    const runProvider = createProviderPacing(config);
    return {
        get: (input: Readonly<{
            actorId: string;
            before?: unknown;
        }>) => protect(input.actorId, async (): Promise<ClientResult<MarketingSnapshot>> => {
            let query = db.selectFrom("marketing_articles").selectAll();
            if (input.before !== undefined && input.before !== null && input.before !== "") {
                if (!uuid(input.before))
                    return failure("invalid_input", "Choose a valid library page.");
                const cursor = await db.selectFrom("marketing_articles").select("id").where("id", "=", input.before as MarketingArticlesId).executeTakeFirst();
                if (!cursor)
                    return failure("not_found", "That article no longer exists. Refresh the library.");
                query = query.where(sql<boolean> `(updated_at,id) < (select page.updated_at,page.id from marketing_articles as page where page.id=${cursor.id}::uuid)`);
            }
            const rows = await query.orderBy("updated_at", "desc").orderBy("id", "desc").limit(51).execute(), shown = rows.slice(0, 50);
            const articles: Article[] = [];
            for (const r of shown) {
                const a = parseArticle(r.data);
                if (!a)
                    throw new Error("Invalid article");
                articles.push({ ...a, id: r.id, revision: r.revision, updatedAt: r.updated_at.toISOString() });
            }
            return { ok: true, value: { articles, youtubeAvailable: provider.youtubeAvailable, voiceAvailable: provider.voiceAvailable, nextCursor: rows.length > 50 ? shown.at(-1)?.id ?? null : null } };
        }),
        save: (input: Readonly<{
            actorId: string;
            article: unknown;
            build?: boolean;
        }>) => protect(input.actorId, async (): Promise<ClientResult<Article>> => {
            const a = parseArticle(input.article);
            if (!a || !uuid(a.id) || !a.title.trim())
                return failure("invalid_input", "Add a subject and valid YouTube source, if used.");
            if (input.build && (!a.sourceUrl || !a.angle.trim() || QUESTIONS.some(q => !a.answers[q.key].trim())))
                return failure("invalid_input", "Add the YouTube source, explain the client relevance and answer all six questions, including a real result or story.");
            const draft = input.build ? buildDraft(a) : a, data = JSON.stringify(draft);
            if (Buffer.byteLength(data) > 220000)
                return failure("invalid_input", "This article is too long. Shorten the interview or draft.");
            const row = a.revision === 0 ? await db.insertInto("marketing_articles").values({ id: a.id as MarketingArticlesId, created_by: input.actorId as AccountsId, data }).onConflict(c => c.column("id").doNothing()).returningAll().executeTakeFirst() : await db.updateTable("marketing_articles").set({ data, revision: a.revision + 1, updated_at: new Date() }).where("id", "=", a.id as MarketingArticlesId).where("revision", "=", a.revision).returningAll().executeTakeFirst();
            if (row)
                return { ok: true, value: { ...draft, revision: row.revision, updatedAt: row.updated_at.toISOString() } };
            const current = await db.selectFrom("marketing_articles").selectAll().where("id", "=", a.id as MarketingArticlesId).executeTakeFirst();
            const saved = current && parseArticle(current.data);
            if (current && saved && JSON.stringify(saved) === JSON.stringify(draft))
                return { ok: true, value: { ...saved, revision: current.revision, updatedAt: current.updated_at.toISOString() } };
            return failure("conflict", "This article changed in another tab. Copy your edits before reloading.");
        }),
        research: (input: Readonly<{
            actorId: string;
            query: unknown;
        }>) => protect(input.actorId, async (): Promise<ClientResult<readonly Topic[]>> => {
            if (!isText(input.query, 300) || !input.query.trim())
                return failure("invalid_input", "Choose a topic to research.");
            return runProvider(() => provider.research({ query: input.query as string }), 2);
        }),
        voice: (input: Readonly<{
            actorId: string;
            base64: unknown;
            mediaType: unknown;
        }>) => protect(input.actorId, async (): Promise<ClientResult<Readonly<{
            text: string;
        }>>> => {
            if (!isText(input.base64, 12 * 1024 * 1024) || !isText(input.mediaType, 100))
                return failure("invalid_input", "Choose a valid voice note.");
            return runProvider(() => provider.transcribe({ base64: input.base64 as string, mediaType: input.mediaType as string }));
        }),
    };
}
export type Marketing = ReturnType<typeof createMarketing>;
