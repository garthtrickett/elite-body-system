import { err, ok } from "../shared/result.ts";
import type { Result } from "../shared/result.ts";
import type { DeliveryConfig } from "../features/auth/index.ts";

export type Config = Readonly<{
  databaseUrl: string; publicOrigin: string; rateKey: string; host: string; port: number;
  delivery: DeliveryConfig;
  openAiApiKey?: string;
  harryPreview?: boolean;
}>;

export function readConfig(env: Readonly<NodeJS.ProcessEnv>): Result<Config, Readonly<{ code: "invalid_configuration" }>> {
  const fail = () => err({ code: "invalid_configuration" } as const);
  try {
    const origin = new URL(env.PUBLIC_ORIGIN ?? "");
    const database = new URL(env.DATABASE_URL ?? "");
    const production = env.NODE_ENV === "production";
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname);
    const localHttp = !production && origin.protocol === "http:" && loopback;
    const port = Number(env.PORT ?? "3000");
    if (origin.origin !== env.PUBLIC_ORIGIN || origin.username || origin.password ||
        (origin.protocol !== "https:" && !localHttp) || origin.port === "0" ||
        !["postgres:", "postgresql:"].includes(database.protocol) ||
        !/^[a-f0-9]{64}$/.test(env.AUTH_RATE_KEY ?? "") ||
        !Number.isInteger(port) || port < 1 || port > 65535) return fail();
    const mode = env.EMAIL_MODE ?? "outbox";
    if (mode === "outbox" && (production || !loopback || origin.protocol !== "http:" ||
        !["127.0.0.1", "localhost", "::1"].includes(env.HOST ?? "127.0.0.1"))) return fail();
    if (mode !== "outbox" && mode !== "resend") return fail();
    if (mode === "resend" && (!env.RESEND_API_KEY || !env.EMAIL_FROM || /[\r\n]/.test(env.EMAIL_FROM))) return fail();
    if (env.AUTH_HARRY_PREVIEW !== undefined && !["true", "false"].includes(env.AUTH_HARRY_PREVIEW)) return fail();
    const delivery: DeliveryConfig = mode === "outbox" ? { mode, directory: ".data/outbox" }
      : { mode, from: env.EMAIL_FROM!, apiKey: env.RESEND_API_KEY! };
    return ok({ databaseUrl: env.DATABASE_URL!, publicOrigin: origin.origin, rateKey: env.AUTH_RATE_KEY!,
      host: env.HOST ?? "127.0.0.1", port, delivery, harryPreview: env.AUTH_HARRY_PREVIEW === "true", ...(env.OPENAI_API_KEY ? { openAiApiKey: env.OPENAI_API_KEY } : {}) });
  } catch { return fail(); }
}
