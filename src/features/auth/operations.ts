import { createHash, createHmac, randomBytes } from "node:crypto";
import { err, ok } from "../../shared/result.ts";
import { normalizeEmail } from "./email.ts";
import { LINK_ACKNOWLEDGEMENT, HARRY_PREVIEW_EMAIL, isHarryPreviewAlias } from "./contracts.ts";
import type { Account, AuthResult, AuthStore, DeliverLink, LinkAcknowledgement } from "./contracts.ts";

export const digestToken = (token: string): string => createHash("sha256").update(token).digest("hex");
export const newToken = (): string => randomBytes(32).toString("base64url");
export function validToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value) &&
    Buffer.from(value, "base64url").toString("base64url") === value;
}

export type Auth = Readonly<{
  provisionAccount: (input: Readonly<{ email: unknown }>) => Promise<AuthResult<Account>>;
  signInHarryPreview: (input: Readonly<{ alias: unknown; clientKey: string }>) => Promise<AuthResult<Readonly<{ account: Account; sessionToken: string }>>>;
  requestLink: (input: Readonly<{ email: unknown; clientKey: string }>) => Promise<AuthResult<LinkAcknowledgement>>;
  inspectLink: (input: Readonly<{ token: unknown }>) => Promise<AuthResult<Account>>;
  redeemLink: (input: Readonly<{ token: unknown }>) => Promise<AuthResult<Readonly<{ account: Account; sessionToken: string }>>>;
  resolveSession: (input: Readonly<{ sessionToken: unknown }>) => Promise<AuthResult<Account>>;
  signOut: (input: Readonly<{ sessionToken: unknown }>) => Promise<AuthResult<Readonly<{ signedOut: true }>>>;
}>;

/** Trusted composition: configuration is validated before creating this module. */
export function createAuth(config: Readonly<{
  store: AuthStore; deliverLink: DeliverLink; publicOrigin: string; rateKey: string; harryPreview?: boolean;
}>): Auth {
  const { store, deliverLink, publicOrigin, rateKey } = config;
  const rateDigest = (kind: string, value: string): string => createHmac("sha256", rateKey)
    .update(JSON.stringify([publicOrigin, kind, value])).digest("hex");
  const unavailable = () => err({ code: "unavailable" } as const);

  return {
    async provisionAccount({ email: input }) {
      const email = normalizeEmail(input);
      if (!email) return err({ code: "invalid_input" });
      try { return ok(await store.provision({ email })); }
      catch { return unavailable(); }
    },
    async signInHarryPreview({ alias, clientKey }) {
      if (!config.harryPreview) return err({ code: "unauthenticated" });
      if (!isHarryPreviewAlias(alias) || !clientKey || clientKey.length > 256) return err({ code: "invalid_input" });
      try {
        const allowed = await store.reserve({ global: rateDigest("global", "all"), client: rateDigest("client", clientKey), recipient: rateDigest("recipient", HARRY_PREVIEW_EMAIL) });
        if (!allowed) return err({ code: "unauthenticated" });
        // Provisioned explicitly by the operator; browser input cannot choose an account.
        const account = await store.findAccount({ email: HARRY_PREVIEW_EMAIL });
        if (!account) return err({ code: "unauthenticated" });
        const digest = digestToken(newToken()), sessionToken = newToken();
        await store.issue({ digest, accountId: account.id });
        const signedIn = await store.redeem({ digest, sessionDigest: digestToken(sessionToken) });
        return signedIn ? ok({ account: signedIn, sessionToken }) : unavailable();
      } catch { return unavailable(); }
    },
    async requestLink({ email: input, clientKey }) {
      const email = normalizeEmail(input);
      if (!email || !clientKey || clientKey.length > 256) return err({ code: "invalid_input" });
      // The acknowledgement deliberately says nothing about admission or delivery.
      // Do not expose account-dependent delivery/storage errors to public callers.
      try {
        const allowed = await store.reserve({ global: rateDigest("global", "all"),
          client: rateDigest("client", clientKey), recipient: rateDigest("recipient", email) });
        if (allowed) {
          const account = await store.findAccount({ email });
          if (account) {
            const token = newToken();
            const digest = digestToken(token);
            await store.issue({ digest, accountId: account.id });
            try {
              await deliverLink({ email, link: `${publicOrigin}/sign-in/confirm#${token}`,
                signal: AbortSignal.timeout(5_000) });
            } catch { await store.revokeChallenge({ digest }); }
          }
        }
      } catch { /* Uniform public result; no secrets or account information in logs. */ }
      return ok({ message: LINK_ACKNOWLEDGEMENT });
    },
    async inspectLink({ token }) {
      if (!validToken(token)) return err({ code: "invalid_link" });
      try {
        const account = await store.inspect({ digest: digestToken(token) });
        return account ? ok(account) : err({ code: "invalid_link" });
      } catch { return unavailable(); }
    },
    async redeemLink({ token }) {
      if (!validToken(token)) return err({ code: "invalid_link" });
      const sessionToken = newToken();
      try {
        const account = await store.redeem({ digest: digestToken(token), sessionDigest: digestToken(sessionToken) });
        return account ? ok({ account, sessionToken }) : err({ code: "invalid_link" });
      } catch { return unavailable(); }
    },
    async resolveSession({ sessionToken }) {
      if (!validToken(sessionToken)) return err({ code: "unauthenticated" });
      try {
        const account = await store.session({ digest: digestToken(sessionToken) });
        return account && (account.email !== HARRY_PREVIEW_EMAIL || config.harryPreview) ? ok(account) : err({ code: "unauthenticated" });
      } catch { return unavailable(); }
    },
    async signOut({ sessionToken }) {
      try {
        if (validToken(sessionToken)) await store.signOut({ digest: digestToken(sessionToken) });
        return ok({ signedOut: true });
      } catch { return unavailable(); }
    },
  };
}
