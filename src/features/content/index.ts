import type { Kysely } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { ContentMediaKey } from "../../platform/database/generated/public/ContentMedia.ts";
import { err, ok } from "../../shared/result.ts";
import type { ClientResult } from "../profile/index.ts";

export function validVideoUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}
export function createContentMedia(db: Kysely<Database>) {
  return {
    async list(): Promise<ClientResult<Readonly<Record<string, string>>>> {
      try {
        const rows = await db.selectFrom("content_media").selectAll().execute();
        if (rows.some(row => !validVideoUrl(row.video_url))) return err({ code: "unavailable", message: "Video configuration could not be loaded." });
        return ok(Object.fromEntries(rows.map(row => [row.key, row.video_url])));
      } catch { return err({ code: "unavailable", message: "Videos could not be loaded." }); }
    },
    // Trusted administrative interface only. There is deliberately no public write route.
    async setVideo(input: Readonly<{ key: string; url: unknown }>): Promise<ClientResult<Readonly<{ configured: true }>>> {
      if (!/^(exercise|course):[a-z][a-z0-9-]{0,50}$/.test(input.key) || (input.url !== null && !validVideoUrl(input.url))) return err({ code: "invalid_input", message: "Use an exercise:ID or course:ID key and an HTTPS video URL (or null to remove)." });
      try {
        if (input.url === null) await db.deleteFrom("content_media").where("key", "=", input.key as ContentMediaKey).execute();
        else await db.insertInto("content_media").values({ key: input.key as ContentMediaKey, video_url: input.url as string }).onConflict(c => c.column("key").doUpdateSet({ video_url: input.url as string })).execute();
        return ok({ configured: true });
      } catch { return err({ code: "unavailable", message: "Video configuration was not saved." }); }
    },
  } as const;
}
