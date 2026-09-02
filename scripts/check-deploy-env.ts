/**
 * Revisa que el entorno este completo y coherente ANTES de desplegar.
 *
 * Existe por un error concreto y silencioso: cruzar el pooler con la conexion
 * directa. La app contra la directa agota conexiones en el primer pico, y las
 * migraciones contra el pooler fallan de formas que no mencionan el pooler,
 * porque el modo transaccion pierde advisory locks. Los dos fallos aparecen
 * lejos de la causa, asi que se revisa aqui y no alla.
 *
 * No imprime ningun valor: solo si esta, si falta y si tiene la forma correcta.
 *
 * Uso: pnpm tsx scripts/check-deploy-env.ts
 */

import { loadEnv } from "../src/lib/load-env.ts";

loadEnv();

type Check = { name: string; ok: boolean; detail: string };

/** Sin estas la app no arranca: `env.ts` las valida al importar. */
const REQUIRED = [
  "DATABASE_URL",
  "DIRECT_DATABASE_URL",
  "AI_MODEL_DEFAULT",
  "AI_MODEL_SMALL",
] as const;

/** La app arranca sin estas, pero el modulo que las usa no funciona. */
const NEEDED_FOR = {
  NEXT_PUBLIC_SUPABASE_URL: "iniciar sesión",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "iniciar sesión",
  SUPABASE_SECRET_KEY: "subir grabaciones",
  SUPABASE_RECORDINGS_BUCKET: "subir grabaciones",
  GEMINI_API_KEY: "Copilot, análisis y evaluación",
  GROQ_API_KEY: "transcribir y el simulacro",
  PUBLIC_BASE_URL: "el callback de transcripción",
  APP_BASE_URL: "el enlace de invitación por correo",
  CRON_SECRET: "proteger /api/cron/retention",
} as const;

function port(url: string | undefined) {
  if (!url) return null;
  const match = /:(\d{2,5})\//.exec(url);
  return match ? Number(match[1]) : null;
}

function main() {
  const checks: Check[] = [];

  for (const name of REQUIRED) {
    checks.push({
      name,
      ok: Boolean(process.env[name]),
      detail: process.env[name] ? "presente" : "FALTA — la app no arranca sin esta",
    });
  }

  for (const [name, purpose] of Object.entries(NEEDED_FOR)) {
    checks.push({
      name,
      ok: Boolean(process.env[name]),
      detail: process.env[name] ? "presente" : `falta — sin esta no funciona: ${purpose}`,
    });
  }

  const appPort = port(process.env.DATABASE_URL);
  const directPort = port(process.env.DIRECT_DATABASE_URL);
  const local = process.env.DATABASE_URL?.includes("127.0.0.1");

  if (!local) {
    checks.push({
      name: "DATABASE_URL usa el pooler",
      ok: appPort === 6543,
      detail:
        appPort === 6543
          ? "puerto 6543, correcto"
          : `puerto ${appPort ?? "?"} — la app va al POOLER (6543). Sin pooler, las conexiones por request agotan la base.`,
    });
    checks.push({
      name: "DIRECT_DATABASE_URL usa la directa",
      ok: directPort === 5432,
      detail:
        directPort === 5432
          ? "puerto 5432, correcto"
          : `puerto ${directPort ?? "?"} — las migraciones van a la DIRECTA (5432). El pooler pierde advisory locks.`,
    });
    checks.push({
      name: "las dos URLs no son la misma",
      ok: process.env.DATABASE_URL !== process.env.DIRECT_DATABASE_URL,
      detail:
        process.env.DATABASE_URL === process.env.DIRECT_DATABASE_URL
          ? "son idénticas — falta separar pooler y directa"
          : "distintas, correcto",
    });
  }

  const provider = process.env.TRANSCRIPTION_PROVIDER ?? "deepgram";
  checks.push({
    name: "el proveedor de transcripción tiene su llave",
    ok:
      provider === "groq"
        ? Boolean(process.env.GROQ_API_KEY)
        : Boolean(process.env.DEEPGRAM_API_KEY),
    detail:
      provider === "groq"
        ? process.env.GROQ_API_KEY
          ? "groq con GROQ_API_KEY"
          : "TRANSCRIPTION_PROVIDER=groq pero falta GROQ_API_KEY"
        : process.env.DEEPGRAM_API_KEY
          ? "deepgram con DEEPGRAM_API_KEY"
          : "TRANSCRIPTION_PROVIDER=deepgram pero falta DEEPGRAM_API_KEY",
  });

  for (const check of checks) {
    console.log(`${check.ok ? "✓" : "✗"} ${check.name.padEnd(38)} ${check.detail}`);
  }

  const faltan = checks.filter((check) => !check.ok);
  console.log(
    faltan.length === 0
      ? "\nTodo listo para desplegar."
      : `\n${faltan.length} sin resolver. Revisa las marcadas con ✗.`,
  );
  // Sale distinto de cero para que se pueda encadenar en un despliegue.
  process.exitCode = faltan.length === 0 ? 0 : 1;
}

main();
