import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: optionalString,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalString,
  SUPABASE_SECRET_KEY: optionalString,
  SUPABASE_RECORDINGS_BUCKET: optionalString,
  VERCEL_GIT_COMMIT_SHA: optionalString,
});

export const env = serverEnvSchema.parse(process.env);
