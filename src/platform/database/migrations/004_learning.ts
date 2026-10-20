import { sql } from "kysely";
import type { Kysely } from "kysely";
export async function up(db: Kysely<unknown>): Promise<void> {
  for (const table of ["neural_maps", "course_progress"] as const) {
    await db.schema.createTable(table).addColumn("account_id", "uuid", c => c.primaryKey().references("accounts.id").onDelete("cascade"))
      .addColumn("data", "jsonb", c => c.notNull()).addColumn("revision", "integer", c => c.notNull().defaultTo(1))
      .addCheckConstraint(`${table}_revision`, sql`revision > 0`).execute();
  }
  await db.schema.createTable("map_reads").addColumn("account_id", "uuid", c => c.notNull().references("accounts.id").onDelete("cascade"))
    .addColumn("day", "date", c => c.notNull()).addColumn("read_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`))
    .addPrimaryKeyConstraint("map_reads_pkey", ["account_id", "day"]).execute();
  await db.schema.createTable("content_media").addColumn("key", "text", c => c.primaryKey()).addColumn("video_url", "text", c => c.notNull())
    .addCheckConstraint("media_https", sql`video_url ~ '^https://' and length(video_url) <= 2048`).execute();
}
export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of ["content_media", "map_reads", "course_progress", "neural_maps"]) await db.schema.dropTable(table).execute();
}
