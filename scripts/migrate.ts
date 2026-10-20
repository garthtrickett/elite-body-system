import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { migrate } from "../src/platform/database/migrate.ts";

// Schema creation must work before Kanel has generated the database types.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 1 }) }) });
try { await migrate(db); console.log("Migrations complete"); }
finally { await db.destroy(); }
