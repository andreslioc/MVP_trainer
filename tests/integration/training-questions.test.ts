import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
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
  generateTrainingQuestions,
  getTrainingSession,
  startTrainingSession,
} from "../../src/server/training/questions.ts";
import { validProductInput } from "../fixtures/product.ts";

const connection = openDirectDatabase("test");
const advisorId = randomUUID();
const otherAdvisorId = randomUUID();
const productId = randomUUID();
const promptVersion = Number.parseInt(randomUUID().slice(0, 7), 16);
const authorizeAdvisor = async () => ({
  ok: true as const,
  data: { id: advisorId, role: "asesor" as const },
});
const authorizeOtherAdvisor = async () => ({
  ok: true as const,
  data: { id: otherAdvisorId, role: "asesor" as const },
});

function generatedBatch(): GeneratedQuestions {
  return {
    questions: [
      ["¿Que contiene?", "informacion", "basica", "Contiene magnesio según la etiqueta."],
      ["¿Cuantas trae?", "uso", "basica", "La presentación contiene 60 cápsulas."],
      ["¿Como se integra?", "uso", "intermedia", "Tiene un formato práctico para la rutina."],
      ["¿Que lo diferencia?", "comparacion", "intermedia", "La etiqueta clara está verificada."],
      [
        "¿Y con medicamentos?",
        "seguridad",
        "dificil",
        "El magnesio aporta el mineral declarado en la etiqueta; si tomas medicamentos, consulta a un profesional.",
      ],
      [
        "¿Garantiza resultados?",
        "objecion",
        "dificil",
        "El magnesio no garantiza resultados; la etiqueta declara su porción y su aporte por cápsula.",
      ],
    ].map(([text, intent, difficulty, idealAnswer]) => ({
      text,
      intent: intent as GeneratedQuestions["questions"][number]["intent"],
      difficulty: difficulty as GeneratedQuestions["questions"][number]["difficulty"],
      ideal_answer: idealAnswer,
      criteria: ["Criterio observable"],
    })),
  };
}

beforeAll(async () => {
  await connection.db.insert(advisors).values([
    {
      id: advisorId,
      email: `training-${advisorId}@example.test`,
      displayName: "Training Advisor",
    },
    {
      id: otherAdvisorId,
      email: `training-${otherAdvisorId}@example.test`,
      displayName: "Other Advisor",
    },
  ]);
  await connection.db.insert(products).values({
    id: productId,
    ...productInputSchema.parse(
      validProductInput({ verifiedAt: new Date("2026-08-18T12:00:00Z") }),
    ),
  });
  await connection.db.insert(prompts).values({
    name: "generate_questions",
    version: promptVersion,
    body: "Prompt de integración",
    active: true,
  });
});

afterAll(async () => {
  await connection.db.delete(trainingSessions).where(eq(trainingSessions.productId, productId));
  await connection.db.delete(trainingQuestions).where(eq(trainingQuestions.productId, productId));
  await connection.db.delete(products).where(eq(products.id, productId));
  await connection.db
    .delete(prompts)
    .where(and(eq(prompts.name, "generate_questions"), eq(prompts.version, promptVersion)));
  await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
  await connection.db.delete(advisors).where(eq(advisors.id, otherAdvisorId));
  await connection.close();
});

describe("training questions and sessions", () => {
  it("persists one valid generated batch with product attribution", async () => {
    const result = await generateTrainingQuestions(productId, {
      authorize: authorizeAdvisor,
      database: connection.db,
      generate: async () => ({
        ok: true,
        data: { value: generatedBatch(), repaired: false },
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.every((question) => question.productId === productId)).toBe(true);
    expect(result.data.every((question) => question.source === "generated")).toBe(true);
  });

  it("writes zero rows when generated content contains an unsupported claim", async () => {
    const batch = generatedBatch();
    batch.questions = batch.questions.map((question, index) => ({
      ...question,
      text: `${question.text} inválida ${index}`,
    }));
    batch.questions[0] = { ...batch.questions[0], ideal_answer: "Este producto cura la diabetes." };
    const before = await connection.db
      .select({ id: trainingQuestions.id })
      .from(trainingQuestions)
      .where(eq(trainingQuestions.productId, productId));

    const result = await generateTrainingQuestions(productId, {
      authorize: authorizeAdvisor,
      database: connection.db,
      generate: async () => ({ ok: true, data: { value: batch, repaired: false } }),
    });
    const after = await connection.db
      .select({ id: trainingQuestions.id })
      .from(trainingQuestions)
      .where(eq(trainingQuestions.productId, productId));

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_GENERATED_QUESTIONS" },
    });
    expect(after).toEqual(before);
  });

  it("guarda el tamano elegido y acota la practica de una sola ficha", async () => {
    const started = await startTrainingSession(productId, 3, {
      authorize: authorizeAdvisor,
      database: connection.db,
    });

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.data.practiceSize).toBe(3);
    expect(started.data.category).toBeNull();

    const loaded = await getTrainingSession(started.data.id, {
      authorize: authorizeAdvisor,
      database: connection.db,
    });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    // La ficha tiene seis preguntas de la tanda generada arriba: el tope lo pone
    // la asesora, no el alcance.
    expect(loaded.data.questions).toHaveLength(3);
    expect(loaded.data.title).toBe(loaded.data.productName);
  });

  it("rechaza un tamano fuera de la lista", async () => {
    const result = await startTrainingSession(productId, 7, {
      authorize: authorizeAdvisor,
      database: connection.db,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", field: "practiceSize" },
    });
  });

  it("opens a private session for the verified server identity", async () => {
    const result = await startTrainingSession(productId, 6, {
      authorize: authorizeAdvisor,
      database: connection.db,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.advisorId).toBe(advisorId);

    const own = await getTrainingSession(result.data.id, {
      authorize: authorizeAdvisor,
      database: connection.db,
    });
    const other = await getTrainingSession(result.data.id, {
      authorize: authorizeOtherAdvisor,
      database: connection.db,
    });
    expect(own.ok).toBe(true);
    expect(other).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "La sesion no existe." },
    });
  });
});
