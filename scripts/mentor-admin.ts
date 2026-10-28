import { createDatabase } from "../src/platform/database/connection.ts";

const [command, mentorEmail, clientEmail] = process.argv.slice(2);
if (!process.env.DATABASE_URL || !mentorEmail || !["grant", "revoke", "assign", "unassign", "scope"].includes(command ?? "")) {
  console.error("Use mentor:admin grant|revoke MENTOR_EMAIL or assign|unassign MENTOR_EMAIL CLIENT_EMAIL. Use scope MENTOR_EMAIL all|selected to change client scope. Accounts must already be provisioned.");
  process.exitCode = 1;
} else {
  const db = createDatabase(process.env.DATABASE_URL);
  try {
    const mentor = await db.selectFrom("accounts").select("id").where("email", "=", mentorEmail).executeTakeFirstOrThrow();
    if (command === "grant") await db.insertInto("performance_mentors").values({ account_id: mentor.id }).onConflict(c => c.column("account_id").doNothing()).execute();
    else if (command === "revoke") await db.deleteFrom("performance_mentors").where("account_id", "=", mentor.id).execute();
    else if (command === "scope") {
      if (!["all", "selected"].includes(clientEmail ?? "")) throw new Error("Choose all or selected");
      if (mentorEmail === "harrybaldwin@preview.invalid" && (process.env.EMAIL_MODE !== "disabled" || process.env.NODE_ENV === "production")) throw new Error("Preview scope is local only");
      await db.updateTable("performance_mentors").set({ all_clients: clientEmail === "all" }).where("account_id", "=", mentor.id).executeTakeFirstOrThrow();
    } else {
      const client = await db.selectFrom("accounts").select("id").where("email", "=", clientEmail ?? "").executeTakeFirstOrThrow();
      if (command === "assign") await db.insertInto("mentor_clients").values({ mentor_id: mentor.id, client_id: client.id }).onConflict(c => c.columns(["mentor_id", "client_id"]).doNothing()).execute();
      else await db.deleteFrom("mentor_clients").where("mentor_id", "=", mentor.id).where("client_id", "=", client.id).execute();
    }
    console.log(JSON.stringify({ ok: true, command }));
  } catch { console.error("Mentor administration failed. Check the provisioned accounts, mentor grant and database configuration."); process.exitCode = 1; }
  finally { await db.destroy(); }
}
