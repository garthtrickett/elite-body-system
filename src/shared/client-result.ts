import type { Result } from "./result.ts";
export type ClientFailure = Readonly<{ code: "invalid_input" | "conflict" | "unavailable" | "not_found" | "forbidden" | "not_configured" | "rate_limited"; message: string }>;
export type ClientResult<T> = Result<T, ClientFailure>;
