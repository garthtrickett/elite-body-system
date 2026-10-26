import { sql } from "kysely";
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createTable("onboarding_marketing_permissions")
    .addColumn("id", "uuid", c => c.primaryKey())
    .addColumn("account_id", "uuid", c => c.notNull().references("accounts.id").onDelete("cascade"))
    .addColumn("revision", "integer", c => c.notNull())
    .addColumn("data", "jsonb", c => c.notNull())
    .addColumn("recorded_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`))
    .addUniqueConstraint("onboarding_marketing_revision", ["account_id", "revision"])
    .addCheckConstraint("onboarding_marketing_positive_revision", sql`revision > 0`).execute();
}
export async function down(db: Kysely<unknown>): Promise<void> { await db.schema.dropTable("onboarding_marketing_permissions").execute(); }
