import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import {
  advisors,
  products,
  prompts,
  trainingAnswers,
  trainingQuestions,
  trainingSessions,
} from "../../src/db/schema.ts";
import { type Evaluation, evaluationDimensionKeys } from "../../src/lib/ai/schemas.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import { evaluateTrainingAnswer } from "../../src/server/training/evaluate.ts";
import { validProductInput } from "../fixtures/product.ts";

const connection = openDirectDatabase("test");
const advisorId = randomUUID();
const otherAdvisorId = randomUUID();
const productId = randomUUID();
const questionId = randomUUID();
const sessionId = randomUUID();
const promptVersion = Number.parseInt(randomUUID().slice(0, 7), 16);
const authorize = (id: string) => async () => ({
  ok: true as const,
  data: { id, role: "asesor" as const },
});

function evaluation(): Evaluation {
  return {
    scores: Object.fromEntries(
      evaluationDimensionKeys.map((key, index) => [
        key,
        { score: (index % 5) + 1, reason: `Razón verificable ${index + 1}` },
      ]),
    ) as Evaluation["scores"],
    feedback: "Buen punto de partida; explica con mayor precisión.",
    improved_answer: "Contiene magnesio y la cantidad exacta se confirma en la etiqueta.",
  };
}

beforeAll(async () => {
  await connection.db.insert(advisors).values([
    { id: advisorId, email: `${advisorId}@example.test`, displayName: "Owner" },
    { id: otherAdvisorId, email: `${otherAdvisorId}@example.test`, displayName: "Other" },
  ]);
  await connection.db.insert(products).values({
    id: productId,
    ...productInputSchema.parse(
      validProductInput({ verifiedAt: new Date("2026-08-18T12:00:00Z") }),
    ),
  });
  await connection.db.insert(trainingQuestions).values({
    id: questionId,
    productId,
    text: "¿Qué contiene?",
    intent: "informacion",
    difficulty: "basica",
    idealAnswer: "Contiene magnesio según la etiqueta.",
    criteria: ["Nombra el ingrediente", "No inventa beneficios"],
    source: "seed",
  });
  await connection.db.insert(trainingSessions).values({ id: sessionId, advisorId, productId });
  await connection.db.insert(prompts).values({
    name: "evaluate_answer",
    version: promptVersion,
    body: "Prompt de evaluación de integración",
    active: true,
  });
});

afterAll(async () => {
  await connection.db.delete(trainingSessions).where(eq(trainingSessions.id, sessionId));
  await connection.db.delete(trainingQuestions).where(eq(trainingQuestions.id, questionId));
  await connection.db.delete(products).where(eq(products.id, productId));
  await connection.db
    .delete(prompts)
    .where(and(eq(prompts.name, "evaluate_answer"), eq(prompts.version, promptVersion)));
  await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
  await connection.db.delete(advisors).where(eq(advisors.id, otherAdvisorId));
  await connection.close();
});

describe("training answer evaluation", () => {
  it("persists the answer, exact nine scores, reasons and improved version", async () => {
    const result = await evaluateTrainingAnswer(
      { sessionId, questionId, advisorAnswer: "Tiene magnesio y viene en cápsulas." },
      {
        authorize: authorize(advisorId),
        database: connection.db,
        generate: async () => ({
          ok: true,
          data: { value: evaluation(), repaired: false },
        }),
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.advisorAnswer).toBe("Tiene magnesio y viene en cápsulas.");
    expect(Object.keys(result.data.scores ?? {}).sort()).toEqual(
      [...evaluationDimensionKeys].sort(),
    );
    expect(Object.values(result.data.scores ?? {}).every(({ reason }) => reason.length > 0)).toBe(
      true,
    );
    expect(result.data.improvedAnswer).toBe(evaluation().improved_answer);
  });

  it("preserves the advisor answer with null evaluation after provider failure", async () => {
    const advisorAnswer = "Mi respuesta debe sobrevivir al fallo del proveedor.";
    const result = await evaluateTrainingAnswer(
      { sessionId, questionId, advisorAnswer },
      {
        authorize: authorize(advisorId),
        database: connection.db,
        generate: async () => ({
          ok: false,
          error: { code: "AI_PROVIDER_ERROR", message: "Proveedor no disponible." },
        }),
      },
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "EVALUATION_PENDING", recoverable: true },
    });
    const [stored] = await connection.db
      .select()
      .from(trainingAnswers)
      .where(eq(trainingAnswers.advisorAnswer, advisorAnswer));
    expect(stored).toMatchObject({
      advisorAnswer,
      scores: null,
      feedback: null,
      improvedAnswer: null,
    });
  });

  it("returns the same 404-style result to another advisor and writes nothing", async () => {
    const before = await connection.db
      .select({ id: trainingAnswers.id })
      .from(trainingAnswers)
      .where(eq(trainingAnswers.sessionId, sessionId));
    const result = await evaluateTrainingAnswer(
      { sessionId, questionId, advisorAnswer: "No debería guardarse." },
      { authorize: authorize(otherAdvisorId), database: connection.db },
    );
    const after = await connection.db
      .select({ id: trainingAnswers.id })
      .from(trainingAnswers)
      .where(eq(trainingAnswers.sessionId, sessionId));

    expect(result).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "La sesion no existe." },
    });
    expect(after).toEqual(before);
  });
});
