import { err, ok } from "../shared/result.ts";
import type { Result } from "../shared/result.ts";
import type { DeliveryConfig } from "../features/auth/index.ts";
import type { AssessmentStorageConfig, GoogleBookingConfig } from "../features/onboarding/index.ts";

export type Config = Readonly<{
  databaseUrl: string; publicOrigin: string; rateKey: string; host: string; port: number;
  delivery: DeliveryConfig;
  openAiApiKey?: string;
  masterEmail?: string;
  youtubeApiKey?: string;
  marketingProviderRpm?: number;
  harryPreview?: boolean;
  onboardingEnabled?: boolean;
  checkinsEnabled?: boolean;
  checkinHour?: number;
  assessmentStorage?: AssessmentStorageConfig;
  googleBooking?: GoogleBookingConfig;
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
    if (env.EBS_MASTER_EMAIL && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.EBS_MASTER_EMAIL)) return fail();
    const marketingProviderRpm = env.MARKETING_PROVIDER_RPM ? Number(env.MARKETING_PROVIDER_RPM) : undefined;
    if (marketingProviderRpm !== undefined && (!Number.isFinite(marketingProviderRpm) || marketingProviderRpm <= 0 || marketingProviderRpm > 1000000)) return fail();
    const mode = env.EMAIL_MODE ?? "outbox";
    if (mode === "outbox" && (production || !loopback || origin.protocol !== "http:" ||
        !["127.0.0.1", "localhost", "::1"].includes(env.HOST ?? "127.0.0.1"))) return fail();
    if (mode !== "outbox" && mode !== "resend" && mode !== "disabled") return fail();
    if (mode === "disabled" && (production || env.AUTH_HARRY_PREVIEW !== "true" ||
        !["127.0.0.1", "localhost", "::1"].includes(env.HOST ?? "127.0.0.1"))) return fail();
    if (mode === "resend" && (!env.RESEND_API_KEY || !env.EMAIL_FROM || /[\r\n]/.test(env.EMAIL_FROM))) return fail();
    if (env.AUTH_HARRY_PREVIEW !== undefined && !["true", "false"].includes(env.AUTH_HARRY_PREVIEW)) return fail();
    if (env.ONBOARDING_ENABLED !== undefined && !["true", "false"].includes(env.ONBOARDING_ENABLED)) return fail();
    if (env.CHECKINS_ENABLED !== undefined && !["true", "false"].includes(env.CHECKINS_ENABLED)) return fail();
    const checkinHour = Number(env.CHECKIN_HOUR ?? "9");
    if (!Number.isInteger(checkinHour) || checkinHour < 0 || checkinHour > 23) return fail();
    const storageKeys = ["ASSESSMENT_S3_ENDPOINT", "ASSESSMENT_S3_REGION", "ASSESSMENT_S3_BUCKET", "ASSESSMENT_S3_ACCESS_KEY_ID", "ASSESSMENT_S3_SECRET_ACCESS_KEY"] as const;
    const configuredStorage = storageKeys.some(key => !!env[key]);
    if (env.ASSESSMENT_S3_FORCE_PATH_STYLE !== undefined && !["true", "false"].includes(env.ASSESSMENT_S3_FORCE_PATH_STYLE)) return fail();
    if (configuredStorage && !storageKeys.every(key => !!env[key])) return fail();
    if (configuredStorage) { const endpoint = new URL(env.ASSESSMENT_S3_ENDPOINT!); if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return fail(); }
    const assessmentStorage = configuredStorage ? { endpoint: env.ASSESSMENT_S3_ENDPOINT!, region: env.ASSESSMENT_S3_REGION!, bucket: env.ASSESSMENT_S3_BUCKET!, accessKeyId: env.ASSESSMENT_S3_ACCESS_KEY_ID!, secretAccessKey: env.ASSESSMENT_S3_SECRET_ACCESS_KEY!, forcePathStyle: env.ASSESSMENT_S3_FORCE_PATH_STYLE !== "false" } : undefined;
    const googleKeys = ["ONBOARDING_GOOGLE_CALENDAR_ID", "ONBOARDING_GOOGLE_CLIENT_ID", "ONBOARDING_GOOGLE_CLIENT_SECRET", "ONBOARDING_GOOGLE_REFRESH_TOKEN"] as const;
    if (googleKeys.some(key => !!env[key]) && !googleKeys.every(key => !!env[key])) return fail();
    const googleBooking = googleKeys.every(key => !!env[key]) ? { calendarId: env.ONBOARDING_GOOGLE_CALENDAR_ID!, clientId: env.ONBOARDING_GOOGLE_CLIENT_ID!, clientSecret: env.ONBOARDING_GOOGLE_CLIENT_SECRET!, refreshToken: env.ONBOARDING_GOOGLE_REFRESH_TOKEN! } : undefined;
    const delivery: DeliveryConfig = mode === "disabled" ? { mode } : mode === "outbox" ? { mode, directory: ".data/outbox" }
      : { mode, from: env.EMAIL_FROM!, apiKey: env.RESEND_API_KEY! };
    return ok({ ...(marketingProviderRpm ? { marketingProviderRpm } : {}), ...(env.EBS_MASTER_EMAIL ? { masterEmail: env.EBS_MASTER_EMAIL.trim().toLowerCase() } : {}), ...(env.YOUTUBE_API_KEY ? { youtubeApiKey: env.YOUTUBE_API_KEY } : {}), databaseUrl: env.DATABASE_URL!, publicOrigin: origin.origin, rateKey: env.AUTH_RATE_KEY!,
      host: env.HOST ?? "127.0.0.1", port, delivery, harryPreview: env.AUTH_HARRY_PREVIEW === "true", onboardingEnabled: env.ONBOARDING_ENABLED === "true", checkinsEnabled: env.CHECKINS_ENABLED !== "false", checkinHour, ...(googleBooking ? { googleBooking } : {}), ...(assessmentStorage ? { assessmentStorage } : {}), ...(env.OPENAI_API_KEY ? { openAiApiKey: env.OPENAI_API_KEY } : {}) });
  } catch { return fail(); }
}
