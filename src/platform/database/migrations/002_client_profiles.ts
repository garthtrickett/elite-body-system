import { sql } from "kysely";
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createTable("client_profiles")
    .addColumn("account_id", "uuid", c => c.primaryKey().references("accounts.id").onDelete("cascade"))
    .addColumn("data", "jsonb", c => c.notNull())
    .addColumn("revision", "integer", c => c.notNull().defaultTo(1))
    .addColumn("updated_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`))
    .addCheckConstraint("profile_revision", sql`revision > 0`).execute();
  await db.schema.createTable("daily_scorecards")
    .addColumn("account_id", "uuid", c => c.notNull().references("accounts.id").onDelete("cascade"))
    .addColumn("day", "date", c => c.notNull())
    .addColumn("data", "jsonb", c => c.notNull())
    .addColumn("revision", "integer", c => c.notNull().defaultTo(1))
    .addColumn("updated_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`))
    .addPrimaryKeyConstraint("daily_scorecards_pkey", ["account_id", "day"])
    .addCheckConstraint("scorecard_revision", sql`revision > 0`).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("daily_scorecards").execute();
  await db.schema.dropTable("client_profiles").execute();
}
