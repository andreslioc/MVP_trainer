import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().min(1),
  VERCEL_GIT_COMMIT_SHA: z.string().min(1).optional(),
});

export const env = serverEnvSchema.parse(process.env);
