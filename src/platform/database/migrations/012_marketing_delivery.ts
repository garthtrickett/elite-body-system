import { sql } from "kysely";
import type { Kysely } from "kysely";
export async function up(db:Kysely<unknown>):Promise<void> {
  await db.schema.alterTable("performance_mentors").addColumn("all_clients","boolean",c=>c.notNull().defaultTo(false)).execute();
  await db.schema.alterTable("sales_leads").addColumn("insights_subscribed_at","timestamptz").addColumn("insights_consent","text").execute();
  await db.schema.createTable("marketing_articles").addColumn("id","uuid",c=>c.primaryKey()).addColumn("created_by","uuid",c=>c.references("accounts.id").onDelete("set null"))
    .addColumn("revision","integer",c=>c.notNull().defaultTo(1)).addColumn("data","jsonb",c=>c.notNull()).addColumn("updated_at","timestamptz",c=>c.notNull().defaultTo(sql`clock_timestamp()`)).execute();
  await db.schema.createTable("coaching_messages").addColumn("id","uuid",c=>c.primaryKey()).addColumn("client_id","uuid",c=>c.notNull().references("accounts.id").onDelete("cascade"))
    .addColumn("sender_id","uuid",c=>c.references("accounts.id").onDelete("set null")).addColumn("request_id","uuid",c=>c.notNull().unique())
    .addColumn("body","text",c=>c.notNull()).addColumn("created_at","timestamptz",c=>c.notNull().defaultTo(sql`clock_timestamp()`)).execute();
  await db.schema.createIndex("coaching_messages_thread").on("coaching_messages").columns(["client_id","created_at"]).execute();
  await db.schema.createTable("coaching_program_adjustments").addColumn("id","uuid",c=>c.primaryKey()).addColumn("client_id","uuid",c=>c.notNull().references("accounts.id").onDelete("cascade"))
    .addColumn("created_by","uuid",c=>c.references("accounts.id").onDelete("set null")).addColumn("request_id","uuid",c=>c.notNull().unique())
    .addColumn("effective_from","date",c=>c.notNull()).addColumn("title","text",c=>c.notNull()).addColumn("instructions","text",c=>c.notNull())
    .addColumn("created_at","timestamptz",c=>c.notNull().defaultTo(sql`clock_timestamp()`)).execute();
}
export async function down(db:Kysely<unknown>):Promise<void> {
  await db.schema.dropTable("coaching_program_adjustments").execute();await db.schema.dropTable("coaching_messages").execute();await db.schema.dropTable("marketing_articles").execute();
  await db.schema.alterTable("sales_leads").dropColumn("insights_subscribed_at").dropColumn("insights_consent").execute();
  await db.schema.alterTable("performance_mentors").dropColumn("all_clients").execute();
}
