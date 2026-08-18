/**
 * Cargador de variables de entorno para todo lo que NO es Next.js.
 *
 * Next carga `.env.local` por su cuenta al arrancar. drizzle-kit, vitest y los
 * scripts de `tsx` no: arrancan con lo que ya este exportado en la shell, que en
 * un build desatendido es nada. Cada uno de esos tres importa esta funcion.
 *
 * Implementado sin dependencias a proposito: `dotenv` no fue verificado en esta
 * sesion y `process.loadEnvFile` depende de la version de @types/node instalada.
 */
import { existsSync, readFileSync } from "node:fs";

// Precedencia, de mayor a menor: shell/CI > .env.local > .env.
// `.env.example` es documentacion y nunca se carga. Como loadEnv no sobrescribe
// valores existentes, el orden de esta lista implementa la cadena literalmente.
const DEFAULT_FILES = [".env.local", ".env"];

function stripQuotes(value: string): string {
  const isDoubleQuoted = value.startsWith('"') && value.endsWith('"');
  const isSingleQuoted = value.startsWith("'") && value.endsWith("'");
  if (value.length >= 2 && (isDoubleQuoted || isSingleQuoted)) {
    return value.slice(1, -1);
  }
  return value;
}

/** Parsea un archivo de tipo `.env` a pares clave/valor. No exporta nada. */
export function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    if (key === "") continue;
    result[key] = stripQuotes(line.slice(separator + 1).trim());
  }
  return result;
}

/**
 * Copia a `process.env` las variables de los archivos indicados sin sobrescribir
 * lo que ya exista: la shell y CI siempre ganan sobre el archivo.
 */
export function loadEnv(files: string[] = DEFAULT_FILES): void {
  for (const file of files) {
    if (!existsSync(file)) continue;
    const parsed = parseEnvFile(readFileSync(file, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}
