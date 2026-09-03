import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import {
  advisors,
  products,
  trainingAnswers,
  trainingQuestions,
  trainingSessions,
} from "../../src/db/schema.ts";
import { evaluationDimensionKeys } from "../../src/lib/ai/schemas.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import {
  finishPracticeIfComplete,
  finishPracticeNow,
} from "../../src/server/training/practice-time.ts";
import { getPracticeSummary, listOpenPractices } from "../../src/server/training/progress.ts";
import { validProductInput } from "../fixtures/product.ts";

const connection = openDirectDatabase("test");
const advisorId = randomUUID();
const otherAdvisorId = randomUUID();
const productId = randomUUID();
const questionIds = [randomUUID(), randomUUID(), randomUUID()];

const authorize = async () => ({
  ok: true as const,
  data: { id: advisorId, role: "asesor" as const },
});

function scores(value: number) {
  return Object.fromEntries(
    evaluationDimensionKeys.map((key) => [key, { score: value, reason: `Nota de ${key}` }]),
  );
}

/** Una sesion nueva del asesor de la prueba, siempre de tres preguntas. */
async function openPractice() {
  const [session] = await connection.db
    .insert(trainingSessions)
    .values({ advisorId, productId, practiceSize: 3 })
    .returning();
  if (!session) throw new Error("No se creo la sesion de prueba.");
  return session.id;
}

async function answer(sessionId: string, index: number, value: number | null) {
  await connection.db.insert(trainingAnswers).values({
    sessionId,
    questionId: questionIds[index] as string,
    advisorAnswer: `Respuesta ${index}`,
    scores: value === null ? null : scores(value),
    feedback: value === null ? null : "Feedback de integracion",
    improvedAnswer: value === null ? null : "Version mejorada de integracion",
  });
}

beforeAll(async () => {
  await connection.db.insert(advisors).values([
    {
      id: advisorId,
      email: `progress-${advisorId}@example.test`,
      displayName: "Progress Advisor",
    },
    {
      id: otherAdvisorId,
      email: `progress-other-${otherAdvisorId}@example.test`,
      displayName: "Otra Asesora",
    },
  ]);
  await connection.db.insert(products).values({
    id: productId,
    ...productInputSchema.parse(
      validProductInput({
        name: `Ficha de progreso ${productId}`,
        verifiedAt: new Date("2026-08-18T12:00:00Z"),
      }),
    ),
  });
  await connection.db.insert(trainingQuestions).values(
    questionIds.map((id, index) => ({
      id,
      productId,
      text: `Pregunta de progreso ${index}`,
      intent: "informacion" as const,
      difficulty: "basica" as const,
      idealAnswer: "Respuesta tomada de la ficha verificada.",
      criteria: ["Criterio observable"],
      source: "seed" as const,
    })),
  );
});

afterAll(async () => {
  // Las respuestas caen con la sesion por la llave en cascada.
  await connection.db.delete(trainingSessions).where(eq(trainingSessions.advisorId, advisorId));
  await connection.db.delete(trainingQuestions).where(eq(trainingQuestions.productId, productId));
  await connection.db.delete(products).where(eq(products.id, productId));
  await connection.db.delete(advisors).where(inArray(advisors.id, [advisorId, otherAdvisorId]));
  await connection.close();
});

describe("practicas sin terminar", () => {
  it("lista la practica abierta con lo que ya respondio", async () => {
    const sessionId = await openPractice();
    await answer(sessionId, 0, 4);

    const result = await listOpenPractices({ authorize, database: connection.db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = result.data.find((practice) => practice.id === sessionId);
    expect(row).toBeDefined();
    expect(row?.answered).toBe(1);
    expect(row?.practiceSize).toBe(3);
  });

  it("una respuesta guardada sin evaluar no cuenta como respondida", async () => {
    const sessionId = await openPractice();
    await answer(sessionId, 0, null);

    const result = await listOpenPractices({ authorize, database: connection.db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.find((practice) => practice.id === sessionId)?.answered).toBe(0);
  });

  it("no muestra la practica de otra asesora", async () => {
    const [ajena] = await connection.db
      .insert(trainingSessions)
      .values({ advisorId: otherAdvisorId, productId, practiceSize: 3 })
      .returning();
    if (!ajena) throw new Error("No se creo la sesion ajena.");

    const result = await listOpenPractices({ authorize, database: connection.db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.some((practice) => practice.id === ajena.id)).toBe(false);
    await connection.db.delete(trainingSessions).where(eq(trainingSessions.id, ajena.id));
  });

  it("una practica cerrada sale de la lista", async () => {
    const sessionId = await openPractice();
    const closed = await finishPracticeNow(sessionId, { authorize, database: connection.db });
    expect(closed.ok).toBe(true);

    const result = await listOpenPractices({ authorize, database: connection.db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.some((practice) => practice.id === sessionId)).toBe(false);
  });
});

describe("cerrar la practica antes de tiempo", () => {
  it("es idempotente: volver a cerrarla no corre la fecha", async () => {
    const sessionId = await openPractice();
    const first = await finishPracticeNow(sessionId, { authorize, database: connection.db });
    const second = await finishPracticeNow(sessionId, { authorize, database: connection.db });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.data.finishedAt.getTime()).toBe(first.data.finishedAt.getTime());
  });

  it("no cierra la practica de otra asesora", async () => {
    const [ajena] = await connection.db
      .insert(trainingSessions)
      .values({ advisorId: otherAdvisorId, productId, practiceSize: 3 })
      .returning();
    if (!ajena) throw new Error("No se creo la sesion ajena.");

    const result = await finishPracticeNow(ajena.id, { authorize, database: connection.db });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
    await connection.db.delete(trainingSessions).where(eq(trainingSessions.id, ajena.id));
  });
});

describe("consolidado de la practica", () => {
  it("promedia lo evaluado, marca lo que falto y ordena las dimensiones", async () => {
    const sessionId = await openPractice();
    await answer(sessionId, 0, 4);
    await answer(sessionId, 1, 2);

    const result = await getPracticeSummary(sessionId, { authorize, database: connection.db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.summary.total).toBe(3);
    expect(result.data.summary.answered).toBe(2);
    expect(result.data.summary.pending).toBe(1);
    expect(result.data.summary.score).toBe(3);
    expect(result.data.summary.complete).toBe(false);
    expect(result.data.summary.rows.filter((row) => row.pending)).toHaveLength(1);
  });

  it("la tanda completa se cierra sola y el consolidado la declara terminada", async () => {
    const sessionId = await openPractice();
    await answer(sessionId, 0, 5);
    await answer(sessionId, 1, 5);
    await answer(sessionId, 2, 4);

    const finishedAt = await finishPracticeIfComplete(sessionId, { database: connection.db });
    expect(finishedAt).toBeInstanceOf(Date);

    const result = await getPracticeSummary(sessionId, { authorize, database: connection.db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.summary.complete).toBe(true);
    expect(result.data.session.finishedAt).toBeInstanceOf(Date);
    expect(result.data.summary.level).toBe("excelente");
  });

  it("con una respuesta sin evaluar la practica NO se cierra sola", async () => {
    const sessionId = await openPractice();
    await answer(sessionId, 0, 5);
    await answer(sessionId, 1, 5);
    await answer(sessionId, 2, null);

    expect(await finishPracticeIfComplete(sessionId, { database: connection.db })).toBeNull();
    const result = await getPracticeSummary(sessionId, { authorize, database: connection.db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.summary.pending).toBe(1);
  });
});
