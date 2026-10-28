import { sql } from "kysely";
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createTable("performance_mentors")
    .addColumn("account_id", "uuid", c => c.primaryKey().references("accounts.id").onDelete("cascade"))
    .addColumn("created_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`)).execute();
  await db.schema.createTable("mentor_clients")
    .addColumn("mentor_id", "uuid", c => c.notNull().references("performance_mentors.account_id").onDelete("cascade"))
    .addColumn("client_id", "uuid", c => c.notNull().references("accounts.id").onDelete("cascade"))
    .addPrimaryKeyConstraint("mentor_clients_pk", ["mentor_id", "client_id"]).execute();
  await db.schema.createTable("weekly_checkin_reviews")
    .addColumn("account_id", "uuid", c => c.notNull())
    .addColumn("week", "date", c => c.notNull())
    .addColumn("reviewed_by", "uuid", c => c.references("accounts.id").onDelete("set null"))
    .addColumn("reviewed_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`))
    .addColumn("checkin_revision", "integer", c => c.notNull())
    .addPrimaryKeyConstraint("weekly_checkin_reviews_pk", ["account_id", "week"])
    .addForeignKeyConstraint("weekly_checkin_reviews_entry", ["account_id", "week"], "weekly_checkins", ["account_id", "week"], c => c.onDelete("cascade"))
    .addCheckConstraint("weekly_checkin_reviews_revision", sql`checkin_revision > 0`).execute();
  await db.schema.createTable("weekly_checkin_summaries")
    .addColumn("account_id", "uuid", c => c.notNull())
    .addColumn("week", "date", c => c.notNull())
    .addColumn("checkin_revision", "integer", c => c.notNull())
    .addColumn("summary", "jsonb", c => c.notNull())
    .addColumn("model", "text", c => c.notNull())
    .addColumn("created_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`))
    .addPrimaryKeyConstraint("weekly_checkin_summaries_pk", ["account_id", "week"])
    .addForeignKeyConstraint("weekly_checkin_summaries_entry", ["account_id", "week"], "weekly_checkins", ["account_id", "week"], c => c.onDelete("cascade"))
    .addCheckConstraint("weekly_checkin_summaries_revision", sql`checkin_revision > 0`).execute();
  await db.schema.createIndex("weekly_checkins_submitted_queue").on("weekly_checkins").columns(["submitted_at", "account_id", "week"]).where("submitted_at", "is not", null).execute();
}
export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("weekly_checkins_submitted_queue").execute();
  await db.schema.dropTable("weekly_checkin_summaries").execute();
  await db.schema.dropTable("weekly_checkin_reviews").execute();
  await db.schema.dropTable("mentor_clients").execute();
  await db.schema.dropTable("performance_mentors").execute();
}
