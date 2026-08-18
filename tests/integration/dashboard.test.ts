import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import {
  advisors,
  insights,
  liveRecordings,
  liveSessions,
  llmCalls,
  products,
  trainingAnswers,
  trainingQuestions,
  trainingSessions,
} from "../../src/db/schema.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import { getDashboardMetrics } from "../../src/server/dashboard.ts";
import { validProductInput } from "../fixtures/product.ts";

const connection = openDirectDatabase("test");
const mineId = randomUUID();
const otherId = randomUUID();
const adminId = randomUUID();
const productId = randomUUID();

const asMine = async () => ({ ok: true as const, data: { id: mineId, role: "asesor" as const } });
const asAdmin = async () => ({ ok: true as const, data: { id: adminId, role: "admin" as const } });

async function seedAdvisorActivity(advisorId: string, sessions: number) {
  for (let index = 0; index < sessions; index += 1) {
    const [session] = await connection.db
      .insert(trainingSessions)
      .values({ advisorId, productId })
      .returning();
    if (!session) throw new Error("no se creo la sesion");
    const [question] = await connection.db
      .insert(trainingQuestions)
      .values({
        productId,
        text: `pregunta ${advisorId.slice(0, 8)}-${index}`,
        intent: "informacion",
        difficulty: "basica",
        idealAnswer: "Responde desde la ficha.",
        criteria: ["Usa la ficha"],
        source: "seed",
      })
      .returning();
    if (!question) throw new Error("no se creo la pregunta");
    await connection.db.insert(trainingAnswers).values({
      sessionId: session.id,
      questionId: question.id,
      advisorAnswer: "Respuesta de prueba.",
    });
  }
  await connection.db.insert(liveSessions).values({ advisorId });
  const [recording] = await connection.db
    .insert(liveRecordings)
    .values({
      advisorId,
      storagePath: `live-recordings/${randomUUID()}.mp4`,
      status: "analyzed",
      transcript: "[Speaker 0] contenido",
      callbackToken: randomUUID(),
      expiresAt: new Date(Date.now() + 90 * 24 * 3_600_000),
    })
    .returning();
  if (!recording) throw new Error("no se creo la grabacion");
  await connection.db.insert(insights).values({
    recordingId: recording.id,
    type: "faq",
    text: `hallazgo ${advisorId.slice(0, 8)}`,
    productId,
    frequency: 1,
  });
}

beforeAll(async () => {
  await connection.db.insert(advisors).values(
    [
      { id: mineId, role: "asesor" as const, name: "Mia" },
      { id: otherId, role: "asesor" as const, name: "Otra" },
      { id: adminId, role: "admin" as const, name: "Admin" },
    ].map((advisor) => ({
      id: advisor.id,
      email: `dashboard-${advisor.id}@example.test`,
      displayName: advisor.name,
      role: advisor.role,
      status: "activa" as const,
    })),
  );
  await connection.db.insert(products).values({
    id: productId,
    ...productInputSchema.parse(
      validProductInput({
        name: `Producto dashboard ${productId}`,
        verifiedAt: new Date("2026-08-18T12:00:00Z"),
      }),
    ),
  });
  await seedAdvisorActivity(mineId, 2);
  await seedAdvisorActivity(otherId, 3);
  await connection.db.insert(llmCalls).values({
    advisorId: mineId,
    purpose: "analyze_transcript",
    model: "gemini-3-flash-preview",
    latencyMs: 1200,
    inputTokens: 1000,
    outputTokens: 500,
    costUsd: "1.500000",
    finishReason: "end_turn",
  });
});

afterAll(async () => {
  for (const advisorId of [mineId, otherId, adminId]) {
    await connection.db.delete(llmCalls).where(eq(llmCalls.advisorId, advisorId));
    await connection.db.delete(liveRecordings).where(eq(liveRecordings.advisorId, advisorId));
    await connection.db.delete(liveSessions).where(eq(liveSessions.advisorId, advisorId));
    await connection.db.delete(trainingSessions).where(eq(trainingSessions.advisorId, advisorId));
  }
  await connection.db.delete(trainingQuestions).where(eq(trainingQuestions.productId, productId));
  await connection.db.delete(products).where(eq(products.id, productId));
  for (const advisorId of [mineId, otherId, adminId]) {
    await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
  }
  await connection.close();
});

describe("getDashboardMetrics", () => {
  it("una asesora solo ve sus propios numeros", async () => {
    const result = await getDashboardMetrics({ authorize: asMine, database: connection.db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.scope).toBe("propio");
    expect(result.data.trainingSessions).toBe(2);
    expect(result.data.answers).toBe(2);
    expect(result.data.liveSessions).toBe(1);
    expect(result.data.recordingsAnalyzed).toBe(1);
    expect(result.data.insights).toBe(1);
  });

  it("una asesora nunca ve el costo de IA", async () => {
    const result = await getDashboardMetrics({ authorize: asMine, database: connection.db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.costUsd).toBeNull();
  });

  it("un admin recibe agregados de la organizacion y el costo total", async () => {
    const result = await getDashboardMetrics({ authorize: asAdmin, database: connection.db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.scope).toBe("organizacion");
    // Suma de las dos asesoras: 2 + 3.
    expect(result.data.trainingSessions).toBeGreaterThanOrEqual(5);
    expect(result.data.recordingsAnalyzed).toBeGreaterThanOrEqual(2);
    expect(result.data.costUsd).toBeGreaterThanOrEqual(1.5);
  });

  it("los numeros de una asesora son estrictamente menores que los de la organizacion", async () => {
    const mine = await getDashboardMetrics({ authorize: asMine, database: connection.db });
    const org = await getDashboardMetrics({ authorize: asAdmin, database: connection.db });
    expect(mine.ok && org.ok).toBe(true);
    if (!mine.ok || !org.ok) return;
    expect(mine.data.trainingSessions).toBeLessThan(org.data.trainingSessions);
  });

  it("propaga el rechazo de autorizacion sin consultar nada", async () => {
    const result = await getDashboardMetrics({
      authorize: async () => ({
        ok: false as const,
        error: { code: "UNAUTHENTICATED", message: "sin sesion" },
      }),
      database: connection.db,
    });
    expect(result.ok).toBe(false);
  });
});
