import { sql } from "kysely";
import type { Kysely } from "kysely";
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createTable("meal_entries")
    .addColumn("account_id", "uuid", c => c.notNull().references("accounts.id").onDelete("cascade"))
    .addColumn("id", "uuid", c => c.notNull()).addColumn("day", "date", c => c.notNull())
    .addColumn("data", "jsonb", c => c.notNull()).addColumn("favorite", "boolean", c => c.notNull())
    .addColumn("removed", "boolean", c => c.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`))
    .addPrimaryKeyConstraint("meal_entries_pkey", ["account_id", "id"]).execute();
  await db.schema.createTable("saved_meals")
    .addColumn("account_id", "uuid", c => c.notNull().references("accounts.id").onDelete("cascade"))
    .addColumn("id", "uuid", c => c.notNull()).addColumn("data", "jsonb", c => c.notNull())
    .addColumn("created_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`))
    .addPrimaryKeyConstraint("saved_meals_pkey", ["account_id", "id"]).execute();
  await db.schema.createTable("meal_analysis_limits").addColumn("key", "text", c => c.primaryKey())
    .addColumn("window_start", "timestamptz", c => c.notNull())
    .addColumn("attempts", "integer", c => c.notNull().defaultTo(0))
    .addColumn("lease_id", "uuid").addColumn("active_until", "timestamptz")
    .addCheckConstraint("analysis_attempts_positive", sql`attempts >= 0`).execute();
}
export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of ["meal_analysis_limits", "saved_meals", "meal_entries"]) await db.schema.dropTable(table).execute();
}
