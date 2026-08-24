import { readFileSync } from "node:fs";

import { loadEnv } from "../src/lib/load-env.ts";

loadEnv();

/**
 * Aplica un archivo de investigacion `research/<sku>.verification.json` sobre la
 * ficha correspondiente.
 *
 * El archivo es el entregable de una verificacion humana: trae la ficha
 * completa ya redactada y, opcionalmente, preguntas de practica observadas en
 * fuentes reales. Aqui no se interpreta nada — se valida contra el esquema de
 * Zod y se escribe. Si el JSON miente, la validacion es lo unico que lo atrapa.
 *
 * Escribe SOLO en local, igual que el importador de catalogo: subir a
 * produccion es un paso aparte y explicito.
 */

const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);

function assertLocalDatabase(databaseUrl: string) {
  const host = new URL(databaseUrl).hostname;
  if (!localHosts.has(host)) {
    throw new Error(`Escritura rechazada: DIRECT_DATABASE_URL apunta a ${host}, no a local.`);
  }
}

type ProposedQuestion = {
  text: string;
  intent: string;
  difficulty: string;
  idealAnswer: string;
  criteria: string[];
  source?: string;
};

async function main() {
  const [path] = process.argv.slice(2);
  if (!path) throw new Error("Uso: pnpm tsx scripts/apply-verification.ts <research/*.json>");

  const [{ openDirectDatabase }, { products, trainingQuestions }, { env }, { productInputSchema }] =
    await Promise.all([
      import("../src/db/client.ts"),
      import("../src/db/schema.ts"),
      import("../src/lib/env.ts"),
      import("../src/lib/validation/product.ts"),
    ]);
  const { and, eq } = await import("drizzle-orm");
  assertLocalDatabase(env.DIRECT_DATABASE_URL);

  const file = JSON.parse(readFileSync(path, "utf8")) as {
    sku: string;
    product_patch: Record<string, unknown> & { id?: string };
    training_questions_proposed?: ProposedQuestion[];
  };
  const patch = productInputSchema.parse(file.product_patch);

  const connection = openDirectDatabase("dev");
  try {
    await connection.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: products.id })
        .from(products)
        .where(eq(products.sku, file.sku))
        .limit(1);
      if (!existing) throw new Error(`No existe una ficha con SKU ${file.sku}.`);

      await tx
        .update(products)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(products.id, existing.id));
      console.info(`${file.sku}: ficha reemplazada.`);

      const proposed = file.training_questions_proposed ?? [];
      if (proposed.length === 0) return;

      // Reemplaza solo las preguntas de la misma fuente: repetir el comando no
      // acumula duplicados, y las que genero el modelo no se tocan. Si una
      // pregunta ya tiene respuestas de practica el borrado falla, que es lo
      // correcto: training_answers.question_id es ON DELETE RESTRICT.
      await tx
        .delete(trainingQuestions)
        .where(
          and(eq(trainingQuestions.productId, existing.id), eq(trainingQuestions.source, "seed")),
        );
      const inserted = await tx
        .insert(trainingQuestions)
        .values(
          proposed.map((question) => ({
            productId: existing.id,
            text: question.text,
            intent: question.intent as "informacion",
            difficulty: question.difficulty as "basica",
            idealAnswer: question.idealAnswer,
            criteria: question.criteria,
            source: "seed" as const,
          })),
        )
        .returning({ id: trainingQuestions.id });
      console.info(`${file.sku}: ${inserted.length} preguntas de practica escritas.`);
    });
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Error desconocido al aplicar.");
  process.exitCode = 1;
});
