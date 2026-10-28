import { sql } from "kysely";
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createTable("weekly_checkin_schedules")
    .addColumn("account_id", "uuid", c => c.primaryKey().references("accounts.id").onDelete("cascade"))
    .addColumn("timezone", "text", c => c.notNull())
    .addColumn("first_week", "date", c => c.notNull())
    .addColumn("created_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`)).execute();
  await db.schema.createTable("weekly_checkins")
    .addColumn("account_id", "uuid", c => c.notNull().references("accounts.id").onDelete("cascade"))
    .addColumn("week", "date", c => c.notNull())
    .addColumn("data", "jsonb", c => c.notNull())
    .addColumn("revision", "integer", c => c.notNull().defaultTo(1))
    .addColumn("saved_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`))
    .addColumn("submitted_at", "timestamptz")
    .addPrimaryKeyConstraint("weekly_checkins_pk", ["account_id", "week"])
    .addCheckConstraint("weekly_checkins_revision", sql`revision > 0`).execute();
}
export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("weekly_checkins").execute();
  await db.schema.dropTable("weekly_checkin_schedules").execute();
}
