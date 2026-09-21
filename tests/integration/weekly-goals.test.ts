import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import {
  advisors,
  pretrainingActivity,
  products,
  trainingAnswers,
  trainingQuestions,
  trainingSessions,
  weeklyTrainingGoals,
} from "../../src/db/schema.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import {
  getMyCurrentWeeklyGoal,
  listWeeklyGoals,
  saveWeeklyGoals,
} from "../../src/server/weekly-goals.ts";
import { validProductInput } from "../fixtures/product.ts";

const connection = openDirectDatabase("test");
const adminId = randomUUID();
const advisorId = randomUUID();
const productId = randomUUID();
const questionId = randomUUID();
const weekStart = "2026-09-21";
const now = () => new Date("2026-09-22T15:00:00Z");
const asAdmin = async () => ({ ok: true as const, data: { id: adminId, role: "admin" as const } });
const asAdvisor = async () => ({
  ok: true as const,
  data: { id: advisorId, role: "asesor" as const },
});

beforeAll(async () => {
  await connection.db.insert(advisors).values([
    {
      id: adminId,
      email: `weekly-admin-${adminId}@example.test`,
      displayName: "Administradora semanal",
      role: "admin",
    },
    {
      id: advisorId,
      email: `weekly-advisor-${advisorId}@example.test`,
      displayName: "Asesora semanal",
      role: "asesor",
    },
  ]);
  const base = productInputSchema.parse(validProductInput());
  await connection.db.insert(products).values({
    ...base,
    id: productId,
    name: `Ficha meta ${productId}`,
    verifiedAt: new Date(),
  });
  await connection.db.insert(trainingQuestions).values({
    id: questionId,
    productId,
    text: `Pregunta meta ${questionId}`,
    intent: "informacion",
    difficulty: "basica",
    idealAnswer: "Respuesta segura",
    source: "seed",
  });
});

afterAll(async () => {
  await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
  await connection.db.delete(advisors).where(eq(advisors.id, adminId));
  await connection.db.delete(products).where(eq(products.id, productId));
  await connection.close();
});

describe("weekly goals", () => {
  it("crea y actualiza atomicamente una sola meta por asesora y semana", async () => {
    const first = await saveWeeklyGoals(
      {
        weekStart,
        assignee: advisorId,
        trainingSessionsTarget: 3,
        pretrainingMinutesTarget: 60,
        productsTarget: 2,
      },
      { authorize: asAdmin, database: connection.db, now },
    );
    const second = await saveWeeklyGoals(
      {
        weekStart,
        assignee: advisorId,
        trainingSessionsTarget: 2,
        pretrainingMinutesTarget: 30,
        productsTarget: 1,
      },
      { authorize: asAdmin, database: connection.db, now },
    );

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    const rows = await connection.db
      .select()
      .from(weeklyTrainingGoals)
      .where(eq(weeklyTrainingGoals.advisorId, advisorId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({ trainingSessionsTarget: 2 }));
  });

  it("cuenta solo Training finalizado y evaluado, y tiempo activo de fichas", async () => {
    const [completed, unfinished, unevaluated] = await connection.db
      .insert(trainingSessions)
      .values([
        {
          advisorId,
          productId,
          startedAt: new Date("2026-09-22T15:00:00Z"),
          finishedAt: new Date("2026-09-22T15:10:00Z"),
        },
        { advisorId, productId, startedAt: new Date("2026-09-22T16:00:00Z") },
        {
          advisorId,
          productId,
          startedAt: new Date("2026-09-22T17:00:00Z"),
          finishedAt: new Date("2026-09-22T17:10:00Z"),
        },
      ])
      .returning({ id: trainingSessions.id });
    await connection.db.insert(trainingAnswers).values([
      {
        sessionId: completed.id,
        questionId,
        advisorAnswer: "Evaluada",
        scores: { claridad: { score: 4, reason: "Bien" } },
      },
      {
        sessionId: unfinished.id,
        questionId,
        advisorAnswer: "Sin terminar",
        scores: { claridad: { score: 4, reason: "Bien" } },
      },
      { sessionId: unevaluated.id, questionId, advisorAnswer: "Sin evaluar", scores: null },
    ]);
    await connection.db.insert(pretrainingActivity).values({
      advisorId,
      productId,
      studyDate: "2026-09-22",
      activeSeconds: 1850,
    });

    const result = await listWeeklyGoals(weekStart, {
      authorize: asAdmin,
      database: connection.db,
      now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = result.data.find((item) => item.advisorId === advisorId);
    expect(row).toEqual(
      expect.objectContaining({
        training: { current: 1, target: 2 },
        pretraining: { current: 30, target: 30 },
        products: { current: 1, target: 1 },
        status: "en_progreso",
      }),
    );

    const own = await getMyCurrentWeeklyGoal({
      authorize: asAdvisor,
      database: connection.db,
      now,
    });
    expect(own.ok).toBe(true);
    if (own.ok) expect(own.data?.training.current).toBe(1);
  });

  it("rechaza semanas pasadas, dias que no son lunes y usuarios sin permisos", async () => {
    const input = {
      weekStart,
      assignee: advisorId,
      trainingSessionsTarget: 1,
      pretrainingMinutesTarget: 0,
      productsTarget: 0,
    };
    const wrongDay = await saveWeeklyGoals(
      { ...input, weekStart: "2026-09-22" },
      { authorize: asAdmin, database: connection.db, now },
    );
    const past = await saveWeeklyGoals(
      { ...input, weekStart: "2026-09-14" },
      { authorize: asAdmin, database: connection.db, now },
    );
    const forbidden = await saveWeeklyGoals(input, {
      authorize: async () => ({
        ok: false as const,
        error: { code: "FORBIDDEN", message: "Sin permiso." },
      }),
      database: connection.db,
      now,
    });

    expect(wrongDay.ok).toBe(false);
    expect(past.ok).toBe(false);
    expect(forbidden.ok).toBe(false);
  });
});
