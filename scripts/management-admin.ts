import { createDatabase } from "../src/platform/database/connection.ts";

const [command,email]=process.argv.slice(2);
if(!process.env.DATABASE_URL || !email || !["grant","revoke","master"].includes(command ?? "")) {
  console.error("Use management:admin grant|revoke|master EMAIL. The account must already be provisioned.");
  process.exitCode=1;
} else {
  const db=createDatabase(process.env.DATABASE_URL);
  try {
    const account=await db.selectFrom("accounts").select("id").where("email","=",email.trim().toLowerCase()).executeTakeFirstOrThrow();
    if(email.trim().toLowerCase()==="harrybaldwin@preview.invalid" && (process.env.EMAIL_MODE!=="disabled" || process.env.AUTH_HARRY_PREVIEW!=="true" || process.env.NODE_ENV==="production")) throw new Error("Preview master access is local only");
    if(command==="master") {
      await db.transaction().execute(async tx=>{
        await tx.insertInto("business_managers").values({account_id:account.id}).onConflict(c=>c.column("account_id").doNothing()).execute();
        await tx.insertInto("performance_mentors").values({account_id:account.id,all_clients:true}).onConflict(c=>c.column("account_id").doUpdateSet({all_clients:true})).execute();
      });
    } else if(command==="grant") await db.insertInto("business_managers").values({account_id:account.id}).onConflict(c=>c.column("account_id").doNothing()).execute();
    else await db.deleteFrom("business_managers").where("account_id","=",account.id).execute();
    console.log(command==="master" ? "Master management and all-client mentor access granted." : command==="grant" ? "Management access granted." : "Management access revoked.");
  } catch { console.error("Management access could not be updated. Check that the account exists and migrations have run."); process.exitCode=1; }
  finally { await db.destroy(); }
}
