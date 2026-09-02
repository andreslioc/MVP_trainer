import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import { type AdvisorRole, hasRole } from "../../src/lib/roles.ts";
import {
  advisors,
  products,
  trainingAnswers,
  trainingQuestions,
  trainingSessions,
} from "../../src/db/schema.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import { CALIBRATION_ANSWERS, getAdvisorAnalytics } from "../../src/server/advisor-analytics.ts";
import {
  finishPracticeIfComplete,
  recordPracticeTime,
} from "../../src/server/training/practice-time.ts";
import { validProductInput } from "../fixtures/product.ts";

const connection = openDirectDatabase("test");
const advisorId = randomUUID();
const adminId = randomUUID();
const productId = randomUUID();

/**
 * Los dobles respetan el rol pedido, como `requireRole`. Un doble que dice si a
 * todo no prueba nada: la primera version de este archivo dejaba pasar a una
 * asesora al panel de administracion y la prueba no se daba cuenta.
 */
const asAdmin = async (role: AdvisorRole) =>
  hasRole("admin", role)
    ? { ok: true as const, data: { id: adminId, role: "admin" as const } }
    : { ok: false as const, error: { code: "FORBIDDEN", message: "Sin permiso." } };
const asAdvisor = async (role: AdvisorRole) =>
  hasRole("asesor", role)
    ? { ok: true as const, data: { id: advisorId, role: "asesor" as const } }
    : { ok: false as const, error: { code: "FORBIDDEN", message: "Sin permiso." } };

const nota = (score: number) => ({
  conocimiento_producto: { score, reason: "r" },
  uso_cta: { score, reason: "r" },
});

let sessionId = "";
let questionIds: string[] = [];

beforeAll(async () => {
  await connection.db.insert(advisors).values([
    {
      id: advisorId,
      email: `${advisorId}@test.co`,
      displayName: "Asesora de prueba",
      role: "asesor",
    },
    { id: adminId, email: `${adminId}@test.co`, displayName: "Admin de prueba", role: "admin" },
  ]);
  const parsed = productInputSchema.parse(validProductInput());
  await connection.db.insert(products).values({ ...parsed, id: productId, verifiedAt: new Date() });

  const preguntas = await connection.db
    .insert(trainingQuestions)
    .values(
      [0, 1].map((index) => ({
        productId,
        text: `pregunta ${index}`,
        intent: "informacion" as const,
        difficulty: "basica" as const,
        idealAnswer: "Responde desde la ficha.",
        criteria: ["Usa la ficha"],
        source: "seed" as const,
      })),
    )
    .returning();
  questionIds = preguntas.map((p) => p.id);

  const [session] = await connection.db
    .insert(trainingSessions)
    .values({ advisorId, productId })
    .returning();
  if (!session) throw new Error("no se creo la sesion");
  sessionId = session.id;
});

afterAll(async () => {
  await connection.db.delete(trainingSessions).where(eq(trainingSessions.advisorId, advisorId));
  await connection.db.delete(trainingQuestions).where(eq(trainingQuestions.productId, productId));
  await connection.db.delete(products).where(eq(products.id, productId));
  await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
  await connection.db.delete(advisors).where(eq(advisors.id, adminId));
  await connection.close();
});

describe("tiempo de practica", () => {
  it("acumula los pulsos en vez de reemplazarlos", async () => {
    await recordPracticeTime(
      { sessionId, seconds: 30 },
      { authorize: asAdvisor, database: connection.db },
    );
    const segundo = await recordPracticeTime(
      { sessionId, seconds: 25 },
      { authorize: asAdvisor, database: connection.db },
    );
    expect(segundo.ok).toBe(true);
    if (!segundo.ok) return;
    expect(segundo.data.activeSeconds).toBe(55);
  });

  it("rechaza un pulso mas grande que el tope, para que un cliente roto no infle el total", async () => {
    const result = await recordPracticeTime(
      { sessionId, seconds: 100_000 },
      { authorize: asAdvisor, database: connection.db },
    );
    expect(result.ok).toBe(false);
  });

  it("no suma tiempo a la practica de otra asesora", async () => {
    const ajena = async () => ({
      ok: true as const,
      data: { id: randomUUID(), role: "asesor" as const },
    });

    const result = await recordPracticeTime(
      { sessionId, seconds: 30 },
      { authorize: ajena, database: connection.db },
    );
    expect(result.ok).toBe(false);
  });
});

describe("cierre de la practica", () => {
  it("no la cierra con la tanda a medias", async () => {
    await connection.db.insert(trainingAnswers).values({
      sessionId,
      questionId: questionIds[0] as string,
      advisorAnswer: "Primera respuesta.",
      scores: nota(4),
    });
    const cerrada = await finishPracticeIfComplete(sessionId, { database: connection.db });
    expect(cerrada).toBeNull();
  });

  it("la cierra cuando se responden todas las preguntas de la ficha", async () => {
    await connection.db.insert(trainingAnswers).values({
      sessionId,
      questionId: questionIds[1] as string,
      advisorAnswer: "Segunda respuesta.",
      scores: nota(2),
    });
    const cerrada = await finishPracticeIfComplete(sessionId, { database: connection.db });
    expect(cerrada).not.toBeNull();
  });

  it("no corre la fecha de cierre si se llama otra vez", async () => {
    const [antes] = await connection.db
      .select({ finishedAt: trainingSessions.finishedAt })
      .from(trainingSessions)
      .where(eq(trainingSessions.id, sessionId));
    const otra = await finishPracticeIfComplete(sessionId, { database: connection.db });
    expect(otra).toBeNull();
    const [despues] = await connection.db
      .select({ finishedAt: trainingSessions.finishedAt })
      .from(trainingSessions)
      .where(eq(trainingSessions.id, sessionId));
    expect(despues?.finishedAt?.toISOString()).toBe(antes?.finishedAt?.toISOString());
  });
});

describe("analiticas de la asesora", () => {
  it("solo las ve un administrador", async () => {
    const result = await getAdvisorAnalytics(
      { advisorId },
      { authorize: asAdvisor, database: connection.db },
    );
    expect(result.ok).toBe(false);
  });

  it("reporta minutos, practicas y acierto en la escala correcta", async () => {
    const result = await getAdvisorAnalytics(
      { advisorId },
      { authorize: asAdmin, database: connection.db },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.advisor.displayName).toBe("Asesora de prueba");
    // 55 segundos redondean a 1 minuto.
    expect(result.data.practiceMinutes).toBe(1);
    expect(result.data.practicesStarted).toBe(1);
    expect(result.data.practicesFinished).toBe(1);
    expect(result.data.answers).toBe(2);
    // Notas de 4 y 2 sobre una rubrica de 1 a 5: promedio 3, que es la mitad
    // exacta del recorrido, o sea 50%. Con una division ingenua por 5 daria 60.
    expect(result.data.accuracyPercent).toBe(50);
    expect(result.data.productsPracticed).toBe(1);
  });

  it("avisa que esta calibrando cuando hay pocas respuestas", async () => {
    const result = await getAdvisorAnalytics(
      { advisorId },
      { authorize: asAdmin, database: connection.db },
    );
    if (!result.ok) return;
    expect(result.data.calibrating).toBe(true);
    expect(result.data.answersToCalibrate).toBeLessThanOrEqual(CALIBRATION_ANSWERS);
  });

  it("ordena las dimensiones de peor a mejor, que es lo que hay que entrenar", async () => {
    const result = await getAdvisorAnalytics(
      { advisorId },
      { authorize: asAdmin, database: connection.db },
    );
    if (!result.ok) return;
    const promedios = result.data.dimensions.map((d) => d.average);
    expect(promedios).toEqual([...promedios].sort((a, b) => a - b));
  });

  it("no inventa un acierto de cero cuando no hay respuestas calificadas", async () => {
    const nuevoId = randomUUID();
    await connection.db.insert(advisors).values({
      id: nuevoId,
      email: `${nuevoId}@test.co`,
      displayName: "Sin practica",
      role: "asesor",
    });
    const result = await getAdvisorAnalytics(
      { advisorId: nuevoId },
      { authorize: asAdmin, database: connection.db },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.accuracyPercent).toBeNull();
    expect(result.data.calibrating).toBe(false);
    await connection.db.delete(advisors).where(eq(advisors.id, nuevoId));
  });
});

describe("el aviso de calibracion cuenta respuestas", () => {
  it("no se declara calibrado por multiplicar por las nueve dimensiones", async () => {
    // Dos respuestas calificadas en las nueve dimensiones son 18 pares, y
    // durante un rato eso paso el umbral de 12 y el panel mostro el puntaje
    // como firme. El umbral es de RESPUESTAS.
    const result = await getAdvisorAnalytics(
      { advisorId },
      { authorize: asAdmin, database: connection.db },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.answers).toBe(2);
    expect(result.data.calibrating).toBe(true);
    expect(result.data.answersToCalibrate).toBe(CALIBRATION_ANSWERS - 2);
  });
});
