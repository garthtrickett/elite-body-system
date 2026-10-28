import { sql } from "kysely";
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createTable("business_managers")
    .addColumn("account_id", "uuid", c => c.primaryKey().references("accounts.id").onDelete("cascade"))
    .addColumn("created_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`)).execute();
  await db.schema.createTable("sales_settings")
    .addColumn("id", "integer", c => c.primaryKey())
    .addColumn("revision", "integer", c => c.notNull().defaultTo(0))
    .addColumn("content", "jsonb", c => c.notNull())
    .addColumn("updated_by", "uuid", c => c.references("accounts.id").onDelete("set null"))
    .addColumn("updated_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`))
    .addCheckConstraint("sales_settings_singleton", sql`id = 1`).execute();
  await db.schema.createTable("sales_visitors")
    .addColumn("id", "uuid", c => c.primaryKey())
    .addColumn("token_hash", "text", c => c.notNull().unique())
    .addColumn("source", "text", c => c.notNull())
    .addColumn("created_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`)).execute();
  await db.schema.createTable("sales_leads")
    .addColumn("id", "uuid", c => c.primaryKey())
    .addColumn("visitor_id", "uuid", c => c.notNull().unique().references("sales_visitors.id").onDelete("cascade"))
    .addColumn("name", "text", c => c.notNull())
    .addColumn("email", "text", c => c.notNull())
    .addColumn("phone", "text", c => c.notNull().defaultTo(""))
    .addColumn("stage", "text", c => c.notNull())
    .addColumn("application", "jsonb", c => c.notNull())
    .addColumn("notes", "text", c => c.notNull().defaultTo(""))
    .addColumn("revision", "integer", c => c.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`))
    .addColumn("updated_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`))
    .addCheckConstraint("sales_lead_stage", sql`stage in ('free_value','applied','call_booked','follow_up','won','lost')`).execute();
  await db.schema.createTable("sales_events")
    .addColumn("id", "uuid", c => c.primaryKey())
    .addColumn("visitor_id", "uuid", c => c.notNull().references("sales_visitors.id").onDelete("cascade"))
    .addColumn("kind", "text", c => c.notNull())
    .addColumn("detail", "text", c => c.notNull().defaultTo(""))
    .addColumn("created_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`)).execute();
  await db.schema.createIndex("sales_events_visitor_time").on("sales_events").columns(["visitor_id", "created_at"]).execute();
  await db.schema.createIndex("sales_leads_created").on("sales_leads").columns(["created_at", "id"]).execute();
  await db.schema.createTable("sales_call_slots")
    .addColumn("id", "uuid", c => c.primaryKey())
    .addColumn("starts_at", "timestamptz", c => c.notNull().unique())
    .addColumn("ends_at", "timestamptz", c => c.notNull())
    .addColumn("meeting_url", "text", c => c.notNull().defaultTo(""))
    .addColumn("booked_lead_id", "uuid", c => c.unique().references("sales_leads.id").onDelete("set null"))
    .addCheckConstraint("sales_slot_duration", sql`ends_at > starts_at`).execute();
}
export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of ["sales_call_slots", "sales_events", "sales_leads", "sales_visitors", "sales_settings", "business_managers"]) await db.schema.dropTable(table).execute();
}
