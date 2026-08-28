import { loadEnv } from "../src/lib/load-env.ts";

loadEnv();

/**
 * Publica los prompts versionados en otra base.
 *
 * Los prompts viven en la tabla `prompts`, no en el codigo: desplegar el repo NO
 * los actualiza. Sin este paso, produccion sigue componiendo respuestas con las
 * versiones viejas —sin capa de seguridad, sin registro de camara— aunque el
 * codigo desplegado sea el nuevo.
 *
 * Existe aparte de `pnpm db:seed` porque la semilla ademas inserta el producto
 * de demostracion y sus preguntas de practica. Eso esta bien en local y es
 * basura en produccion.
 *
 * La URL se pasa en `PUBLISH_DATABASE_URL` y no se lee de `.env`: escribir en
 * una base remota es una decision explicita, y un script que toma la URL del
 * archivo se dispara solo cuando alguien lo corre sin pensar.
 *
 * Uso: PUBLISH_DATABASE_URL="postgres://..." pnpm tsx scripts/publish-prompts.ts
 */

async function main() {
  const target = process.env.PUBLISH_DATABASE_URL;
  if (!target) {
    throw new Error(
      "Falta PUBLISH_DATABASE_URL. Pasa la URL de la base destino en la misma linea del comando.",
    );
  }

  const [{ default: postgres }, { drizzle }, schema, { PROMPT_SEEDS }] = await Promise.all([
    import("postgres"),
    import("drizzle-orm/postgres-js"),
    import("../src/db/schema.ts"),
    import("./prompt-seeds.ts"),
  ]);
  const { sql } = await import("drizzle-orm");

  const client = postgres(target, { max: 1, prepare: false, ssl: "require" });
  const db = drizzle(client, { schema });

  try {
    const written = await db
      .insert(schema.prompts)
      .values(PROMPT_SEEDS.map((seed) => ({ ...seed, version: 1, active: true })))
      .onConflictDoUpdate({
        target: [schema.prompts.name, schema.prompts.version],
        set: { body: sql`excluded.body`, active: sql`excluded.active` },
      })
      .returning({ name: schema.prompts.name });

    console.info(`${written.length} prompts publicados:`);
    for (const prompt of written) console.info(`  · ${prompt.name}`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Error desconocido al publicar prompts.");
  process.exitCode = 1;
});
