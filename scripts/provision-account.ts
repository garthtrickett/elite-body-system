import { createAuth, createPostgresAuthStore } from "../src/features/auth/index.ts";
import { createDatabase } from "../src/platform/database/connection.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const db = createDatabase(databaseUrl);
const auth = createAuth({ store: createPostgresAuthStore(db), publicOrigin: "https://provision.invalid",
  rateKey: "unused-for-provisioning", deliverLink: async () => { throw new Error("Provisioning does not send email"); } });
try {
  const result = await auth.provisionAccount({ email: process.argv[2] });
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
} finally { await db.destroy(); }
