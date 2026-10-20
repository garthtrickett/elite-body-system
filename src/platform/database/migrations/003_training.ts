import { sql } from "kysely";
import type { Kysely } from "kysely";
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createTable("workout_sessions")
    .addColumn("account_id", "uuid", c => c.notNull().references("accounts.id").onDelete("cascade"))
    .addColumn("day", "date", c => c.notNull())
    .addColumn("data", "jsonb", c => c.notNull())
    .addColumn("revision", "integer", c => c.notNull().defaultTo(1))
    .addPrimaryKeyConstraint("workout_sessions_pkey", ["account_id", "day"])
    .addCheckConstraint("workout_revision", sql`revision > 0`).execute();
}
export async function down(db: Kysely<unknown>): Promise<void> { await db.schema.dropTable("workout_sessions").execute(); }
