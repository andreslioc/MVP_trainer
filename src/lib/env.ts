import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const positiveInteger = z.coerce.number().int().positive();

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  DIRECT_DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().min(1),
  SUPABASE_LOCAL_DATABASE_URL: optionalString,
  NEXT_PUBLIC_SUPABASE_URL: optionalString,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalString,
  SUPABASE_SECRET_KEY: optionalString,
  SUPABASE_RECORDINGS_BUCKET: optionalString,
  DEEPGRAM_API_KEY: optionalString,
  DEEPGRAM_BASE_URL: optionalString,
  DEEPGRAM_MODEL: optionalString,
  DEEPGRAM_LANGUAGE: optionalString,
  DEEPGRAM_CALLBACK_SECRET: optionalString,
  PUBLIC_BASE_URL: optionalString,
  CRON_SECRET: optionalString,
  RECORDING_RETENTION_DAYS: positiveInteger.default(90),
  ANTHROPIC_API_KEY: optionalString,
  AI_MODEL_DEFAULT: z.string().min(1),
  AI_MODEL_SMALL: z.string().min(1),
  AI_MAX_CONCURRENCY: positiveInteger.default(4),
  VERCEL_GIT_COMMIT_SHA: optionalString,
});

export const env = serverEnvSchema.parse(process.env);

const supabasePublicEnvSchema = z.object({
  url: z.url(),
  publishableKey: z.string().min(1),
});

export function getSupabasePublicEnv() {
  return supabasePublicEnvSchema.parse({
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export function getSupabaseAdminEnv() {
  const { url } = getSupabasePublicEnv();
  return z
    .object({ url: z.url(), secretKey: z.string().min(1) })
    .parse({ url, secretKey: env.SUPABASE_SECRET_KEY });
}
