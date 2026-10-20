import { Migrator } from "kysely";
import type { Kysely } from "kysely";
import * as auth from "./migrations/001_auth.ts";

export async function migrate<DB>(db: Kysely<DB>): Promise<void> {
  const outcome = await new Migrator({ db, provider: {
    getMigrations: async () => ({ "001_auth": auth }),
  } }).migrateToLatest();
  if (outcome.error) throw outcome.error;
}
