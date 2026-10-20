import { createDatabase } from "../src/platform/database/connection.ts";
import { createContentMedia } from "../src/features/content/index.ts";
const [key, url] = process.argv.slice(2);
if (!process.env.DATABASE_URL || !key || !url) {
  console.error('Usage: npm run content:video -- exercise:squat https://example.com/squat.mp4 (use - to remove)');
  process.exitCode = 1;
} else {
  const db = createDatabase(process.env.DATABASE_URL);
  try { const result = await createContentMedia(db).setVideo({ key, url: url === "-" ? null : url }); console.log(JSON.stringify(result)); if (!result.ok) process.exitCode = 1; }
  catch { console.error('Video configuration unavailable'); process.exitCode = 1; }
  finally { await db.destroy(); }
}
