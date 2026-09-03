import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import {
  advisors,
  products,
  prompts,
  trainingQuestions,
  trainingSessions,
} from "../../src/db/schema.ts";
import type { GeneratedQuestions } from "../../src/lib/ai/schemas.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import {
  generateCategoryTrainingQuestions,
  listTrainingCategories,
  startCategoryTrainingSession,
} from "../../src/server/training/categories.ts";
import { getTrainingSession } from "../../src/server/training/questions.ts";
import { validProductInput } from "../fixtures/product.ts";

const connection = openDirectDatabase("test");
const advisorId = randomUUID();
// La categoria lleva el id del run: la tabla de productos es compartida entre
// archivos de prueba y una categoria fija haria que dos runs se vieran.
const category = `Categoria de prueba ${advisorId}`;
const emptyCategory = `Categoria vacia ${advisorId}`;
const productIds = [randomUUID(), randomUUID(), randomUUID()];
// Una categoria aparte, con cuatro fichas y sin preguntas, para ver a cuantas
// llega un solo clic de "Generar preguntas".
const wideCategory = `Categoria amplia ${advisorId}`;
const wideProductIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const promptVersion = Number.parseInt(randomUUID().slice(0, 7), 16);

function generatedBatch(seed: string): GeneratedQuestions {
  return {
    questions: [
      ["Que contiene el magnesio", "informacion", "basica"],
      ["Cuantas capsulas trae el magnesio", "uso", "basica"],
      ["Como se toma el magnesio", "uso", "intermedia"],
      ["Que diferencia al magnesio", "comparacion", "intermedia"],
      ["Puedo tomar magnesio con medicamentos", "seguridad", "dificil"],
      ["El magnesio garantiza resultados", "objecion", "dificil"],
    ].map(([text, intent, difficulty]) => ({
      text: `${text} ${seed}?`,
      intent: intent as GeneratedQuestions["questions"][number]["intent"],
      difficulty: difficulty as GeneratedQuestions["questions"][number]["difficulty"],
      ideal_answer: "La etiqueta del magnesio indica la porcion; consulta a un profesional.",
      criteria: ["Criterio observable"],
    })),
  };
}
const authorize = async () => ({
  ok: true as const,
  data: { id: advisorId, role: "asesor" as const },
});

beforeAll(async () => {
  await connection.db.insert(advisors).values({
    id: advisorId,
    email: `categories-${advisorId}@example.test`,
    displayName: "Category Advisor",
  });
  await connection.db.insert(products).values(
    productIds.map((id, index) => ({
      id,
      ...productInputSchema.parse(
        validProductInput({
          name: `Ficha de categoria ${index}`,
          category: index === 2 ? emptyCategory : category,
          verifiedAt: new Date("2026-08-18T12:00:00Z"),
        }),
      ),
    })),
  );
  await connection.db.insert(products).values(
    wideProductIds.map((id, index) => ({
      id,
      ...productInputSchema.parse(
        validProductInput({
          name: `Ficha amplia ${index}`,
          category: wideCategory,
          verifiedAt: new Date("2026-08-18T12:00:00Z"),
        }),
      ),
    })),
  );
  await connection.db.insert(prompts).values({
    name: "generate_questions",
    version: promptVersion,
    body: "Prompt de integración",
    active: true,
  });
  // Cuatro preguntas repartidas en las dos fichas de la categoria poblada.
  await connection.db.insert(trainingQuestions).values(
    [0, 1].flatMap((productIndex) =>
      [0, 1].map((questionIndex) => ({
        productId: productIds[productIndex] as string,
        text: `Pregunta ${productIndex}-${questionIndex}`,
        intent: "informacion" as const,
        difficulty: "basica" as const,
        idealAnswer: "Respuesta tomada de la ficha verificada.",
        criteria: ["Criterio observable"],
        source: "generated" as const,
      })),
    ),
  );
});

afterAll(async () => {
  await connection.db.delete(trainingSessions).where(eq(trainingSessions.advisorId, advisorId));
  await connection.db
    .delete(trainingQuestions)
    .where(inArray(trainingQuestions.productId, [...productIds, ...wideProductIds]));
  await connection.db
    .delete(products)
    .where(inArray(products.id, [...productIds, ...wideProductIds]));
  await connection.db
    .delete(prompts)
    .where(and(eq(prompts.name, "generate_questions"), eq(prompts.version, promptVersion)));
  await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
  await connection.close();
});

describe("practica por categoria", () => {
  it("agrupa las fichas verificadas por categoria con sus conteos", async () => {
    const result = await listTrainingCategories({ authorize, database: connection.db });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.find((row) => row.category === category)).toEqual({
      category,
      productCount: 2,
      questionCount: 4,
    });
    expect(result.data.find((row) => row.category === emptyCategory)).toEqual({
      category: emptyCategory,
      productCount: 1,
      questionCount: 0,
    });
  });

  it("abre una practica sin ficha fija y mezcla preguntas de varias fichas", async () => {
    const started = await startCategoryTrainingSession(category, 12, {
      authorize,
      database: connection.db,
    });

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.data.productId).toBeNull();
    expect(started.data.category).toBe(category);

    const loaded = await getTrainingSession(started.data.id, {
      authorize,
      database: connection.db,
    });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.data.title).toBe(category);
    expect(loaded.data.questions).toHaveLength(4);
    expect(new Set(loaded.data.questions.map((question) => question.productName)).size).toBe(2);

    // El orden es barajado pero estable: la practica retomada cae siempre en la
    // misma pregunta pendiente, aunque la asesora recargue.
    const reloaded = await getTrainingSession(started.data.id, {
      authorize,
      database: connection.db,
    });
    expect(reloaded.ok).toBe(true);
    if (!reloaded.ok) return;
    expect(reloaded.data.questions.map((question) => question.id)).toEqual(
      loaded.data.questions.map((question) => question.id),
    );
  });

  it("un solo clic cubre tres fichas distintas, no una", async () => {
    let call = 0;
    const result = await generateCategoryTrainingQuestions(wideCategory, {
      authorize,
      database: connection.db,
      generate: async () => {
        call += 1;
        return { ok: true as const, data: { value: generatedBatch(`t${call}`), repaired: false } };
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(call).toBe(3);
    expect(result.data).toHaveLength(18);
    expect(new Set(result.data.map((question) => question.productId)).size).toBe(3);
  });

  it("guarda las fichas que si pasaron cuando una tanda se sale del Hub", async () => {
    let call = 0;
    const result = await generateCategoryTrainingQuestions(wideCategory, {
      authorize,
      database: connection.db,
      generate: async () => {
        call += 1;
        const batch = generatedBatch(`f${call}`);
        if (call === 1) {
          batch.questions[0] = {
            ...(batch.questions[0] as GeneratedQuestions["questions"][number]),
            ideal_answer: "Este producto cura la diabetes.",
          };
        }
        return { ok: true as const, data: { value: batch, repaired: false } };
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(call).toBe(3);
    expect(result.data).toHaveLength(12);
  });

  it("la tanda nueva reemplaza a la anterior en vez de sumarse", async () => {
    const generate = async () => {
      calls += 1;
      return { ok: true as const, data: { value: generatedBatch(`r${calls}`), repaired: false } };
    };
    let calls = 0;

    const first = await generateCategoryTrainingQuestions(wideCategory, {
      authorize,
      database: connection.db,
      generate,
    });
    const second = await generateCategoryTrainingQuestions(wideCategory, {
      authorize,
      database: connection.db,
      generate,
    });

    expect(first.ok && second.ok).toBe(true);
    if (!second.ok) return;
    const total = await connection.db
      .select({ id: trainingQuestions.id })
      .from(trainingQuestions)
      .innerJoin(products, eq(products.id, trainingQuestions.productId))
      .where(eq(products.category, wideCategory));
    // Dos clics de 18 preguntas dejan 18, no 36.
    expect(total).toHaveLength(18);
    expect(second.replaced).toBe(18);
  });

  it("respeta el tamano elegido para la practica", async () => {
    const started = await startCategoryTrainingSession(wideCategory, 6, {
      authorize,
      database: connection.db,
    });

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.data.practiceSize).toBe(6);

    const loaded = await getTrainingSession(started.data.id, {
      authorize,
      database: connection.db,
    });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    // La categoria amplia tiene mas de seis preguntas: el tope lo pone la
    // eleccion de la asesora, no lo que haya en la base.
    expect(loaded.data.questions).toHaveLength(6);
  });

  it("rechaza un tamano fuera de la lista antes de tocar la base", async () => {
    const result = await startCategoryTrainingSession(wideCategory, 500, {
      authorize,
      database: connection.db,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", field: "practiceSize" },
    });
  });

  it("no abre una practica de una categoria sin preguntas", async () => {
    const result = await startCategoryTrainingSession(emptyCategory, 6, {
      authorize,
      database: connection.db,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });
});
