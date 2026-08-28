import { loadEnv } from "../src/lib/load-env.ts";

loadEnv();

/**
 * Sube las fichas de la base local a otra base, por SKU.
 *
 * Por SKU y no por id, y actualizando en vez de reemplazar la tabla: en la base
 * destino hay preguntas de practica y respuestas de asesoras que apuntan a esas
 * fichas por su id. Un volcado que borra e inserta deja ese historial huerfano.
 *
 * Lo que NO viaja:
 * - Fichas sin SKU en el destino. No se tocan: si alguien creo una a mano alla,
 *   este script no es quien decide borrarla.
 * - `DEMO-CREATINA-001`, que es semilla de demostracion.
 * - Las copias de trabajo con sufijo `-ESP`, que existen para probar y no son
 *   productos reales del catalogo.
 *
 * Uso: PUBLISH_DATABASE_URL="postgres://..." pnpm tsx scripts/publish-products.ts [--apply]
 * Sin `--apply` solo dice que haria.
 */

const EXCLUDED_SKUS = new Set(["DEMO-CREATINA-001"]);

function shouldPublish(sku: string | null) {
  if (!sku) return false;
  if (EXCLUDED_SKUS.has(sku)) return false;
  return !sku.endsWith("-ESP");
}

async function main() {
  const target = process.env.PUBLISH_DATABASE_URL;
  if (!target) {
    throw new Error(
      "Falta PUBLISH_DATABASE_URL. Pasa la URL de la base destino en la misma linea del comando.",
    );
  }
  const apply = process.argv.includes("--apply");

  const [{ default: postgres }, { drizzle }, schema, { openDirectDatabase }] = await Promise.all([
    import("postgres"),
    import("drizzle-orm/postgres-js"),
    import("../src/db/schema.ts"),
    import("../src/db/client.ts"),
  ]);
  const { eq } = await import("drizzle-orm");

  const source = openDirectDatabase("dev");
  const client = postgres(target, { max: 1, prepare: false, ssl: "require" });
  const destination = drizzle(client, { schema });

  try {
    const local = await source.db.select().from(schema.products);
    const remote = await destination.select().from(schema.products);
    const remoteBySku = new Map(
      remote.filter((row) => row.sku).map((row) => [row.sku as string, row]),
    );

    const publishable = local.filter((row) => shouldPublish(row.sku));
    const skipped = local.length - publishable.length;
    const toInsert = publishable.filter((row) => !remoteBySku.has(row.sku as string));
    const toUpdate = publishable.filter((row) => remoteBySku.has(row.sku as string));
    const untouched = remote.filter(
      (row) => !row.sku || !publishable.some((l) => l.sku === row.sku),
    );

    console.info(
      `local ${local.length} · destino ${remote.length} · a insertar ${toInsert.length} · a actualizar ${toUpdate.length} · omitidas ${skipped} · intactas en destino ${untouched.length}`,
    );
    if (!apply) {
      console.info("\nEnsayo. Nada se escribio. Corre otra vez con --apply para publicar.");
      return;
    }

    let inserted = 0;
    let updated = 0;
    const failed: Array<{ sku: string; reason: string }> = [];

    for (const row of toInsert) {
      try {
        await destination.insert(schema.products).values(row);
        inserted += 1;
      } catch (error) {
        failed.push({
          sku: String(row.sku),
          reason: error instanceof Error ? error.message.slice(0, 120) : "desconocido",
        });
      }
    }

    for (const row of toUpdate) {
      // Se actualiza por el id que ya tiene el destino, no por el local: si en
      // algun momento divergieron, mandan las referencias del destino.
      const remoteRow = remoteBySku.get(row.sku as string);
      if (!remoteRow) continue;
      const { id: _localId, createdAt: _createdAt, ...content } = row;
      try {
        await destination
          .update(schema.products)
          .set({ ...content, updatedAt: new Date() })
          .where(eq(schema.products.id, remoteRow.id));
        updated += 1;
      } catch (error) {
        failed.push({
          sku: String(row.sku),
          reason: error instanceof Error ? error.message.slice(0, 120) : "desconocido",
        });
      }
    }

    console.info(`\ninsertadas ${inserted} · actualizadas ${updated} · fallidas ${failed.length}`);
    for (const item of failed) console.error(`  ✕ ${item.sku}: ${item.reason}`);
    if (failed.length > 0) process.exitCode = 2;
  } finally {
    await source.close();
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Error desconocido al publicar fichas.");
  process.exitCode = 1;
});
