import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

/**
 * Entero positivo que trata la cadena vacia igual que la ausencia.
 *
 * Sin el preprocesado, `z.coerce.number()` convierte "" en 0 y el `.default()`
 * nunca entra, porque para Zod el valor SI vino. Vercel crea las variables que
 * detecta en `.env.example` con valor vacio, asi que un despliegue recien
 * importado llegaba con AI_MAX_CONCURRENCY="" y moria con "expected number to
 * be >0" —un mensaje que no sugiere en ningun momento que la variable este en
 * blanco—. Vacio y ausente tienen que comportarse igual.
 *
 * El valor por defecto se sustituye ANTES de convertir y no con `.default()`:
 * ese solo entra cuando la entrada es `undefined`, y "" no lo es.
 */
function positiveInteger(fallback: number) {
  return z.preprocess(
    (value) => (value === "" || value === undefined ? fallback : value),
    z.coerce.number().int().positive(),
  );
}

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  DIRECT_DATABASE_URL: z.string().min(1),
  /**
   * Opcional a proposito: en produccion no existe una base de pruebas.
   *
   * Exigirla aqui hacia que la app no arrancara en Vercel sin inventarse un
   * valor falso, y `env` se valida al importar, asi que el fallo era total y
   * sin relacion aparente con la causa. Quien la necesita —`tests/setup.ts` y
   * `openDirectDatabase("test")`— la exige por su cuenta y con un mensaje que
   * dice como resolverlo.
   */
  TEST_DATABASE_URL: optionalString,
  SUPABASE_LOCAL_DATABASE_URL: optionalString,
  NEXT_PUBLIC_SUPABASE_URL: optionalString,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalString,
  SUPABASE_SECRET_KEY: optionalString,
  SUPABASE_RECORDINGS_BUCKET: optionalString,
  /**
   * Tope por archivo del bucket, en bytes.
   *
   * Configurable porque no lo decide este proyecto: es el plan de Supabase. El
   * gratuito corta en 50 MB y rechaza crear un bucket que pida mas —"The object
   * exceeded the maximum allowed size"—, un error que no menciona el plan y deja
   * la semilla a medias.
   */
  SUPABASE_MAX_UPLOAD_BYTES: positiveInteger(200 * 1024 * 1024),
  DEEPGRAM_API_KEY: optionalString,
  DEEPGRAM_BASE_URL: optionalString,
  DEEPGRAM_MODEL: optionalString,
  DEEPGRAM_LANGUAGE: optionalString,
  DEEPGRAM_CALLBACK_SECRET: optionalString,
  PUBLIC_BASE_URL: optionalString,
  GROQ_API_KEY: optionalString,
  GROQ_BASE_URL: optionalString,
  GROQ_MODEL: optionalString,
  TRANSCRIPTION_PROVIDER: z.enum(["deepgram", "groq"]).default("deepgram"),
  TRANSCRIPTION_MAX_BYTES: positiveInteger(25 * 1024 * 1024),
  CRON_SECRET: optionalString,
  RECORDING_RETENTION_DAYS: positiveInteger(90),
  GEMINI_API_KEY: optionalString,
  GEMINI_BASE_URL: optionalString,
  AI_MODEL_DEFAULT: z.string().min(1),
  AI_MODEL_SMALL: z.string().min(1),
  AI_MAX_CONCURRENCY: positiveInteger(4),
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
