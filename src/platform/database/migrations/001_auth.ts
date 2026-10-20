import { sql } from "kysely";
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createTable("accounts")
    .addColumn("id", "uuid", c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("email", "text", c => c.notNull().unique())
    .addColumn("created_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`))
    .execute();
  await db.schema.createTable("auth_challenges")
    .addColumn("digest", "text", c => c.primaryKey())
    .addColumn("account_id", "uuid", c => c.notNull().references("accounts.id").onDelete("cascade"))
    .addColumn("expires_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp() + interval '10 minutes'`))
    .addCheckConstraint("challenge_digest", sql`digest ~ '^[a-f0-9]{64}$'`).execute();
  await db.schema.createTable("auth_sessions")
    .addColumn("digest", "text", c => c.primaryKey())
    .addColumn("account_id", "uuid", c => c.notNull().references("accounts.id").onDelete("cascade"))
    .addColumn("idle_expires_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp() + interval '30 minutes'`))
    .addColumn("absolute_expires_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp() + interval '8 hours'`))
    .addCheckConstraint("session_digest", sql`digest ~ '^[a-f0-9]{64}$'`)
    .addCheckConstraint("session_expiry", sql`idle_expires_at <= absolute_expires_at`).execute();
  await db.schema.createTable("auth_rate_limits")
    .addColumn("digest", "text", c => c.primaryKey())
    .addColumn("window_started_at", "timestamptz", c => c.notNull().defaultTo(sql`clock_timestamp()`))
    .addColumn("attempts", "integer", c => c.notNull())
    .addCheckConstraint("rate_digest", sql`digest ~ '^[a-f0-9]{64}$'`)
    .addCheckConstraint("rate_attempts", sql`attempts between 1 and 200`).execute();
  await db.schema.createIndex("challenge_expiry").on("auth_challenges").column("expires_at").execute();
  await db.schema.createIndex("session_expiry").on("auth_sessions").column("idle_expires_at").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("auth_rate_limits").execute();
  await db.schema.dropTable("auth_sessions").execute();
  await db.schema.dropTable("auth_challenges").execute();
  await db.schema.dropTable("accounts").execute();
}
