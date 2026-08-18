/**
 * Arranque de entorno para vitest. vitest corre fuera de Next, asi que nada
 * carga .env.local por el: este archivo es el mecanismo (blueprint.md §19.6).
 */
import { loadEnv } from "../src/lib/load-env.ts";

loadEnv();

// Las pruebas SIEMPRE corren contra la base de docker-compose, nunca contra la
// base de desarrollo. TEST_DATABASE_URL es la unica conexion que ven.
if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL no esta definida. Corre `pnpm db:up` y revisa .env.local (ver blueprint.md §17).",
  );
}

// El codigo de servidor lee DATABASE_URL. Dentro de las pruebas la apuntamos a
// la base de pruebas para que ningun modulo pueda tocar la base de desarrollo,
// ni por descuido ni por un import transitivo.
Object.assign(process.env, {
  // Las pruebas explicitas de RLS necesitan la instancia local de Supabase.
  // Conservamos esa URL bajo un nombre inequívoco antes de aislar el resto.
  SUPABASE_LOCAL_DATABASE_URL: process.env.DIRECT_DATABASE_URL,
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  DIRECT_DATABASE_URL: process.env.TEST_DATABASE_URL,
  NODE_ENV: "test",
});
