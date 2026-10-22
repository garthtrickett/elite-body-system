import { sql } from "kysely";
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createTable("onboarding_records")
    .addColumn("account_id", "uuid", c => c.primaryKey().references("accounts.id").onDelete("cascade"))
    .addColumn("flow_version", "text", c => c.notNull().defaultTo("harry-v2"))
    .addColumn("data", "jsonb", c => c.notNull())
    .addColumn("revision", "integer", c => c.notNull().defaultTo(1))
    .addColumn("completed_at", "timestamptz")
    .addColumn("updated_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`))
    .addCheckConstraint("onboarding_revision", sql`revision > 0`).execute();
  await db.schema.createTable("onboarding_settings")
    .addColumn("key", "text", c => c.primaryKey())
    .addColumn("data", "jsonb", c => c.notNull())
    .addColumn("revision", "integer", c => c.notNull().defaultTo(1)).execute();
  await db.schema.createTable("assessment_media")
    .addColumn("id", "uuid", c => c.primaryKey())
    .addColumn("account_id", "uuid", c => c.notNull().references("accounts.id").onDelete("cascade"))
    .addColumn("slot", "text", c => c.notNull())
    .addColumn("content_version", "text", c => c.notNull())
    .addColumn("object_key", "text", c => c.notNull().unique())
    .addColumn("media_type", "text", c => c.notNull())
    .addColumn("size", "integer", c => c.notNull())
    .addColumn("status", "text", c => c.notNull().defaultTo("pending"))
    .addColumn("created_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`))
    .addColumn("finalized_at", "timestamptz")
    .addCheckConstraint("assessment_media_size", sql`size > 0 AND size <= 262144000`)
    .addCheckConstraint("assessment_media_status", sql`status in ('pending', 'ready', 'deleted')`).execute();
  await db.schema.createIndex("assessment_media_owner_slot").on("assessment_media").columns(["account_id", "slot"]).execute();
  await db.schema.createTable("onboarding_bookings")
    .addColumn("account_id", "uuid", c => c.primaryKey().references("accounts.id").onDelete("cascade"))
    .addColumn("provider_id", "text", c => c.notNull().unique())
    .addColumn("event_version", "bigint", c => c.notNull())
    .addColumn("status", "text", c => c.notNull())
    .addColumn("starts_at", "timestamptz", c => c.notNull())
    .addColumn("timezone", "text", c => c.notNull())
    .addColumn("meet_url", "text", c => c.notNull())
    .addColumn("verified_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`))
    .addCheckConstraint("onboarding_booking_status", sql`status in ('confirmed', 'cancelled')`).execute();
  await db.schema.createTable("onboarding_resolutions")
    .addColumn("id", "uuid", c => c.primaryKey())
    .addColumn("account_id", "uuid", c => c.notNull().references("accounts.id").onDelete("cascade"))
    .addColumn("requirement", "text", c => c.notNull())
    .addColumn("reason", "text", c => c.notNull())
    .addColumn("resolved_by", "text", c => c.notNull())
    .addColumn("evidence", "text", c => c.notNull())
    .addColumn("created_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`)).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of ["onboarding_resolutions", "onboarding_bookings", "assessment_media", "onboarding_settings", "onboarding_records"]) await db.schema.dropTable(table).execute();
}
