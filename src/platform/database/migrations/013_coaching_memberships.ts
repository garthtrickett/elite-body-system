import {sql} from "kysely";
import type {Kysely} from "kysely";
export async function up(db:Kysely<unknown>):Promise<void> {
 await db.schema.createTable("coaching_memberships").addColumn("client_id","uuid",c=>c.primaryKey().references("accounts.id").onDelete("cascade"))
  .addColumn("level","text",c=>c.notNull()).addColumn("active","boolean",c=>c.notNull().defaultTo(true))
  .addColumn("revision","integer",c=>c.notNull().defaultTo(1)).addColumn("updated_by","uuid",c=>c.references("accounts.id").onDelete("set null"))
  .addColumn("updated_at","timestamptz",c=>c.notNull().defaultTo(sql`clock_timestamp()`))
  .addCheckConstraint("coaching_membership_level",sql`level in ('group','individual')`).execute();
 await db.schema.alterTable("coaching_messages").addColumn("from_mentor","boolean",c=>c.notNull().defaultTo(false)).execute();
 await db.schema.createTable("coaching_thread_reads").addColumn("client_id","uuid",c=>c.notNull().references("accounts.id").onDelete("cascade"))
  .addColumn("reader_id","uuid",c=>c.notNull().references("accounts.id").onDelete("cascade"))
  .addColumn("last_message_id","uuid",c=>c.references("coaching_messages.id").onDelete("set null"))
  .addPrimaryKeyConstraint("coaching_thread_reads_pk",["client_id","reader_id"]).execute();
 await db.schema.createTable("coaching_community_posts").addColumn("id","uuid",c=>c.primaryKey())
  .addColumn("author_id","uuid",c=>c.references("accounts.id").onDelete("set null")).addColumn("request_id","uuid",c=>c.notNull().unique())
  .addColumn("body","text",c=>c.notNull()).addColumn("from_mentor","boolean",c=>c.notNull().defaultTo(false)).addColumn("created_at","timestamptz",c=>c.notNull().defaultTo(sql`clock_timestamp()`)).execute();
 await db.schema.createIndex("coaching_community_time").on("coaching_community_posts").columns(["created_at","id"]).execute();
 await db.schema.alterTable("coaching_program_adjustments").addColumn("plan_key","integer").addColumn("program_rules","jsonb",c=>c.notNull().defaultTo(sql`'{}'::jsonb`)).execute();
}
export async function down(db:Kysely<unknown>):Promise<void> {
 await db.schema.alterTable("coaching_program_adjustments").dropColumn("plan_key").dropColumn("program_rules").execute();
 await db.schema.alterTable("coaching_messages").dropColumn("from_mentor").execute();
 await db.schema.dropTable("coaching_community_posts").execute();await db.schema.dropTable("coaching_thread_reads").execute();await db.schema.dropTable("coaching_memberships").execute();
}
