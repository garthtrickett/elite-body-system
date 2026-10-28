import { sql } from "kysely";
import type { Kysely, Transaction } from "kysely";
import type Database from "../../platform/database/generated/Database.ts";
import type { AccountsId } from "../../platform/database/generated/public/Accounts.ts";
type Db = Kysely<Database> | Transaction<Database>;
export function mentorClientScope(input: Readonly<{
    actorId: string;
    clientRef: string;
}>) {
    return sql<boolean> `exists (select 1 from performance_mentors as access_mentor where access_mentor.account_id = ${input.actorId}::uuid and (exists (select 1 from mentor_clients as access_assignment where access_assignment.mentor_id = access_mentor.account_id and access_assignment.client_id = ${sql.ref(input.clientRef)}) or access_mentor.all_clients = true))`;
}
export async function mentorAccess(input: Readonly<{
    db: Db;
    actorId: string;
    clientId?: string;
}>): Promise<boolean> {
    if (input.clientId)
        return !!await input.db.selectFrom("accounts").select("id").where("id", "=", input.clientId as AccountsId).where(mentorClientScope({ actorId: input.actorId, clientRef: "accounts.id" })).executeTakeFirst();
    return !!await input.db.selectFrom("performance_mentors").select("account_id").where("account_id", "=", input.actorId as AccountsId).executeTakeFirst();
}
export async function managerAccess(input: Readonly<{
    db: Db;
    actorId: string;
}>): Promise<boolean> { return !!await input.db.selectFrom("business_managers").select("account_id").where("account_id", "=", input.actorId as AccountsId).executeTakeFirst(); }
