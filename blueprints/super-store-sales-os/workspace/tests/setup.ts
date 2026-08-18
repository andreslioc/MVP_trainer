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
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DIRECT_DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = "test";
