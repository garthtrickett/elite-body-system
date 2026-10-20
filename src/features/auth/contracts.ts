import type { Result } from "../../shared/result.ts";

export type Account = Readonly<{ id: string; email: string }>;
export type AuthFailure = Readonly<{
  code: "invalid_input" | "invalid_link" | "unauthenticated" | "unavailable";
}>;
export type AuthResult<T> = Result<T, AuthFailure>;
export const LINK_ACKNOWLEDGEMENT = "If this email can sign in, a link will arrive shortly.";
export type LinkAcknowledgement = Readonly<{ message: typeof LINK_ACKNOWLEDGEMENT }>;

// These seams have real Postgres/outbox/HTTP adapters and test implementations.
export type AuthStore = Readonly<{
  provision: (input: Readonly<{ email: string }>) => Promise<Account>;
  findAccount: (input: Readonly<{ email: string }>) => Promise<Account | undefined>;
  reserve: (input: Readonly<{ global: string; client: string; recipient: string }>) => Promise<boolean>;
  issue: (input: Readonly<{ digest: string; accountId: string }>) => Promise<void>;
  inspect: (input: Readonly<{ digest: string }>) => Promise<Account | undefined>;
  revokeChallenge: (input: Readonly<{ digest: string }>) => Promise<void>;
  redeem: (input: Readonly<{ digest: string; sessionDigest: string }>) => Promise<Account | undefined>;
  session: (input: Readonly<{ digest: string }>) => Promise<Account | undefined>;
  signOut: (input: Readonly<{ digest: string }>) => Promise<void>;
}>;
export type DeliverLink = (input: Readonly<{ email: string; link: string; signal: AbortSignal }>) => Promise<void>;
