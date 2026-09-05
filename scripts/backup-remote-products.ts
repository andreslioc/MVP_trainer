import { mkdirSync, writeFileSync } from "node:fs";

import { loadEnv } from "../src/lib/load-env.ts";

loadEnv();

/**
 * Baja las fichas de otra base y las guarda en `backups/`.
 *
 * Existe porque `publish-products.ts` escribe en el destino y no guarda nada
 * antes: si una publicacion pisa una ficha que alguien curo a mano alla, no hay
 * a donde volver. Un respaldo del destino ANTES de aplicar convierte una
 * publicacion en algo reversible, y por eso este script se corre primero.
 *
 * Toma la URL de la misma variable que el publicador, `PUBLISH_DATABASE_URL`,
 * para que los dos comandos se peguen seguidos sin cambiar nada. Escribir o leer
 * una base remota es una decision explicita: la URL no se lee de `.env`.
 *
 * Uso: PUBLISH_DATABASE_URL="postgres://..." pnpm tsx scripts/backup-remote-products.ts
 */
async function main() {
  const target = process.env.PUBLISH_DATABASE_URL;
  if (!target) {
    throw new Error(
      "Falta PUBLISH_DATABASE_URL. Pasa la URL de la base de la que quieres el respaldo en la misma linea del comando.",
    );
  }

  const [{ default: postgres }, { drizzle }, schema] = await Promise.all([
    import("postgres"),
    import("drizzle-orm/postgres-js"),
    import("../src/db/schema.ts"),
  ]);
  const { asc } = await import("drizzle-orm");

  const client = postgres(target, { max: 1, prepare: false, ssl: "require" });
  const database = drizzle(client, { schema });

  try {
    const rows = await database.select().from(schema.products).orderBy(asc(schema.products.name));
    const host = new URL(target).hostname;
    const marca = new Date().toISOString().replace(/[:.]/g, "-");
    mkdirSync("backups", { recursive: true });
    const path = `backups/produccion-productos-${marca}.json`;
    // 0600: la ficha no es secreta, pero el volcado sale de una base remota y no
    // tiene por que quedar legible para todo el mundo en el disco.
    writeFileSync(path, `${JSON.stringify(rows, null, 2)}\n`, { mode: 0o600 });

    const conSku = rows.filter((row) => row.sku).length;
    console.info(`${rows.length} fichas de ${host} guardadas en ${path}`);
    console.info(
      `  con SKU: ${conSku} · sin SKU: ${rows.length - conSku} (el publicador no las toca)`,
    );
    if (rows.length === 0) {
      console.warn("  OJO: el destino no tiene fichas. Revisa que la URL sea la que crees.");
    }
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  // La CAUSA, no solo el envoltorio. Drizzle envuelve el fallo en un "Failed
  // query: ..." que repite el SQL y esconde lo unico que importa —"Network is
  // unreachable", "password authentication failed", "SSL required"—, y sin eso
  // no se puede distinguir una URL mal escrita de una red que no llega.
  if (error instanceof Error) {
    console.error(error.message);
    const causa = (error as { cause?: unknown }).cause;
    if (causa instanceof Error) {
      console.error(`CAUSA: ${causa.message}`);
      const codigo = (causa as { code?: unknown }).code;
      if (typeof codigo === "string") console.error(`CODIGO: ${codigo}`);
    }
  } else {
    console.error("Error desconocido al respaldar.");
  }
  process.exitCode = 1;
});
