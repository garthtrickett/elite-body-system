import { sql } from "kysely";
import type { Kysely } from "kysely";
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createTable("marketing_stories")
    .addColumn("id", "uuid", c => c.primaryKey())
    .addColumn("account_id", "uuid", c => c.notNull().references("accounts.id").onDelete("cascade"))
    .addColumn("data", "jsonb", c => c.notNull())
    .addColumn("created_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`)).execute();
  await db.schema.createIndex("marketing_stories_account_created").on("marketing_stories").columns(["account_id", "created_at"]).execute();
}
export async function down(db: Kysely<unknown>): Promise<void> { await db.schema.dropTable("marketing_stories").execute(); }
