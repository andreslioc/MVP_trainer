import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import { advisors, products, trainingQuestions, trainingSessions } from "../../src/db/schema.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import {
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
    .where(inArray(trainingQuestions.productId, productIds));
  await connection.db.delete(products).where(inArray(products.id, productIds));
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
    const started = await startCategoryTrainingSession(category, {
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

    // El orden es barajado pero estable: el `?q=` de la URL apunta siempre a la
    // misma pregunta, aunque la asesora recargue.
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

  it("no abre una practica de una categoria sin preguntas", async () => {
    const result = await startCategoryTrainingSession(emptyCategory, {
      authorize,
      database: connection.db,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });
});
