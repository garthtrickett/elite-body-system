import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { DeliverLink } from "./contracts.ts";

export type DeliveryConfig =
  | Readonly<{ mode: "disabled" }>
  | Readonly<{ mode: "outbox"; directory: string }>
  | Readonly<{ mode: "resend"; from: string; apiKey: string }>;

export function createLinkDelivery(config: DeliveryConfig, send: typeof fetch = fetch): DeliverLink {
  if (config.mode === "disabled") return async () => { throw new Error("Email delivery unavailable"); };
  if (config.mode === "outbox") {
    const directory = resolve(config.directory);
    return async ({ email, link, signal }) => {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(resolve(directory, `${randomUUID()}.json`), JSON.stringify({ to: email, link }),
        { encoding: "utf8", mode: 0o600, flag: "wx", signal });
    };
  }
  return async ({ email, link, signal }) => {
    const response = await send("https://api.resend.com/emails", { method: "POST", signal,
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.from, to: [email], subject: "Sign in to Elite Body System",
        text: `Use this link to sign in to Elite Body System:\n\n${link}\n\nThis link expires in 10 minutes. If you did not request it, ignore this email.` }),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error("Email delivery unavailable");
  };
}
