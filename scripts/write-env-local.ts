/**
 * Genera y ACTUALIZA .env.local.
 *
 * Dos modos, ambos idempotentes y ambos preservando toda clave que ya exista en
 * .env.local (por ejemplo ANTHROPIC_API_KEY, que el usuario pega a mano).
 * Precedencia al generar: defaults < .env < .env.local. El modo
 * --from-supabase refresca deliberadamente solo las tres llaves locales de
 * Supabase y las escribe en .env.local:
 *
 *   sin argumentos  -> escribe solo los valores locales conocidos por defecto
 *                      (bases de datos, buckets, modelos). No necesita Supabase.
 *   --from-supabase -> ademas copia API_URL / ANON_KEY / SERVICE_ROLE_KEY desde
 *                      `.supabase-status.env`, que se produce con
 *                      `supabase status -o env > .supabase-status.env`.
 *
 * Por que un script y no `eval`: los nombres de clave que emite
 * `supabase status -o env` cambiaron entre versiones del CLI. Aqui aceptamos
 * varios alias y, si falta alguno, FALLAMOS con la lista de claves que si
 * encontramos. Un `eval` silencioso dejaria valores vacios y el error aparecia
 * tres pasos despues como "mi entorno esta roto".
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { parseEnvFile } from "../src/lib/load-env.ts";

const ENV_LOCAL = ".env.local";
const STATUS_FILE = ".supabase-status.env";

/** Valores locales que no dependen de que Supabase este corriendo. */
const LOCAL_DEFAULTS: Record<string, string> = {
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  DIRECT_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:55432/super_store_test",
  SUPABASE_RECORDINGS_BUCKET: "live-recordings",
  AI_MODEL_DEFAULT: "claude-opus-5",
  AI_MODEL_SMALL: "claude-haiku-4-5",
  AI_MAX_CONCURRENCY: "4",
  DEEPGRAM_BASE_URL: "https://api.deepgram.com/v1/listen",
  DEEPGRAM_MODEL: "nova-3",
  DEEPGRAM_LANGUAGE: "es-419",
  PUBLIC_BASE_URL: "http://127.0.0.1:3000",
  RECORDING_RETENTION_DAYS: "90",
};

/** Alias aceptados por variable de Supabase, en orden de preferencia. */
const SUPABASE_ALIASES: Record<string, string[]> = {
  NEXT_PUBLIC_SUPABASE_URL: ["API_URL", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: [
    "PUBLISHABLE_KEY",
    "ANON_KEY",
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ],
  SUPABASE_SECRET_KEY: ["SECRET_KEY", "SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"],
};

function readExisting(): Record<string, string> {
  if (!existsSync(ENV_LOCAL)) return {};
  return parseEnvFile(readFileSync(ENV_LOCAL, "utf8"));
}

function resolveSupabase(status: Record<string, string>): Record<string, string> {
  const resolved: Record<string, string> = {};
  const missing: string[] = [];

  for (const [target, aliases] of Object.entries(SUPABASE_ALIASES)) {
    const hit = aliases.find((alias) => {
      const value = status[alias];
      return value !== undefined && value !== "";
    });
    if (hit) {
      resolved[target] = status[hit] as string;
    } else {
      missing.push(`${target} (buscado como: ${aliases.join(", ")})`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      [
        `No se pudieron resolver ${missing.length} variable(s) de Supabase desde ${STATUS_FILE}:`,
        ...missing.map((entry) => `  - ${entry}`),
        `Claves presentes en ${STATUS_FILE}: ${Object.keys(status).join(", ") || "(ninguna)"}`,
        "El CLI de supabase renombro sus claves de salida. Corre `pnpm supabase:check`,",
        "revisa `supabase status -o env` a mano y ajusta SUPABASE_ALIASES en este script.",
      ].join("\n"),
    );
  }

  return resolved;
}

function main(): void {
  const fromSupabase = process.argv.includes("--from-supabase");
  const base = existsSync(".env") ? parseEnvFile(readFileSync(".env", "utf8")) : {};
  const existing = readExisting();

  // Precedencia estable: defaults < .env < .env.local. Shell/CI gana despues,
  // cuando loadEnv() carga el archivo sin sobrescribir process.env.
  const merged: Record<string, string> = { ...LOCAL_DEFAULTS, ...base, ...existing };

  if (fromSupabase) {
    if (!existsSync(STATUS_FILE)) {
      throw new Error(`${STATUS_FILE} no existe. Corre: supabase status -o env > ${STATUS_FILE}`);
    }
    Object.assign(merged, resolveSupabase(parseEnvFile(readFileSync(STATUS_FILE, "utf8"))));
  } else {
    // Sin Supabase todavia: garantizamos que las claves existan, vacias, para
    // que src/lib/env.ts las vea como opcionales y no como ausentes.
    for (const key of Object.keys(SUPABASE_ALIASES)) {
      if (merged[key] === undefined) merged[key] = "";
    }
  }

  for (const key of [
    "ANTHROPIC_API_KEY",
    "DEEPGRAM_API_KEY",
    "DEEPGRAM_CALLBACK_SECRET",
    "CRON_SECRET",
  ]) {
    if (merged[key] === undefined) merged[key] = "";
  }

  const body = Object.keys(merged)
    .sort()
    .map((key) => `${key}="${merged[key]}"`)
    .join("\n");

  writeFileSync(
    ENV_LOCAL,
    `# Generado por \`pnpm env:local\`. Editable a mano: se preserva.\n${body}\n`,
  );
  const mode = fromSupabase ? "con llaves de Supabase" : "sin llaves de Supabase (aun)";
  console.log(`${ENV_LOCAL} escrito ${mode}: ${Object.keys(merged).length} variables.`);
}

main();
