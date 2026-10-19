import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type Database from "./generated/Database.ts";

export function createDatabase(connectionString: string): Kysely<Database> {
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool: new pg.Pool({
    connectionString, max: 4, connectionTimeoutMillis: 3_000,
    statement_timeout: 5_000, idle_in_transaction_session_timeout: 5_000,
  }) }) });
}
