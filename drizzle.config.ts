import { defineConfig } from "drizzle-kit";
import { loadEnv } from "./src/lib/load-env.ts";

// drizzle-kit no lee .env.local por su cuenta. Este import es el mecanismo de
// carga (blueprint.md §19.6): esta escrito una sola vez, aqui, y por eso no se
// puede olvidar en un call site.
loadEnv();

// DRIZZLE_TARGET decide contra que base corre drizzle-kit:
//   sin definir / "dev"  -> DIRECT_DATABASE_URL  (Postgres de Supabase local)
//   "test"               -> TEST_DATABASE_URL    (Postgres de docker-compose)
// Siempre la conexion DIRECTA, nunca el pooler: un pooler en modo transaccion
// pierde advisory locks y prepared statements, y drizzle-kit necesita ambos.
const target = process.env.DRIZZLE_TARGET === "test" ? "test" : "dev";
const variable = target === "test" ? "TEST_DATABASE_URL" : "DIRECT_DATABASE_URL";
const url = process.env[variable];

if (!url) {
  throw new Error(
    `${variable} no esta definida (DRIZZLE_TARGET=${target}). Corre \`pnpm env:local\` o revisa .env.local (ver blueprint.md §17).`,
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
