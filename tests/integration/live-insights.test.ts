import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import {
  advisors,
  insights,
  liveRecordings,
  products,
  prompts,
  trainingQuestions,
} from "../../src/db/schema.ts";
import {
  ANALYZE_TRANSCRIPT_PROMPT,
  REDACTION_TOKENS,
} from "../../src/lib/ai/prompts/analyze-transcript.ts";
import type { TranscriptInsights } from "../../src/lib/ai/schemas.ts";
import type { StructuredOutputResult } from "../../src/lib/ai/structured.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import { promoteInsight } from "../../src/server/insights.ts";
import { analyzeRecording } from "../../src/server/recordings/analyze.ts";
import { validProductInput } from "../fixtures/product.ts";

const connection = openDirectDatabase("test");
const advisorId = randomUUID();
const otherAdvisorId = randomUUID();
const productId = randomUUID();
const promptVersion = Number.parseInt(randomUUID().slice(0, 7), 16);

const authorize = async () => ({
  ok: true as const,
  data: { id: advisorId, role: "asesor" as const },
});

function generator(value: TranscriptInsights) {
  const seen: Array<{ system: string; messages: Array<{ content: string }> }> = [];
  const generate = async (input: {
    system: string;
    messages: Array<{ role: string; content: string }>;
  }): Promise<StructuredOutputResult<TranscriptInsights>> => {
    seen.push({ system: input.system, messages: input.messages });
    return { ok: true, data: { value, repaired: false } };
  };
  return { generate: generate as never, seen };
}

async function createRecording(transcript: string) {
  const id = randomUUID();
  await connection.db.insert(liveRecordings).values({
    id,
    advisorId,
    storagePath: `live-recordings/${id}.mp4`,
    status: "transcribed",
    transcript,
    durationS: 5400,
    callbackToken: randomUUID(),
    expiresAt: new Date(Date.now() + 90 * 24 * 3_600_000),
  });
  return id;
}

beforeAll(async () => {
  await connection.db.insert(advisors).values([
    {
      id: advisorId,
      email: `insights-${advisorId}@example.test`,
      displayName: "Insights",
      role: "asesor",
      status: "activa",
    },
    {
      id: otherAdvisorId,
      email: `otra-${otherAdvisorId}@example.test`,
      displayName: "Otra",
      role: "asesor",
      status: "activa",
    },
  ]);
  await connection.db.insert(products).values({
    id: productId,
    ...productInputSchema.parse(
      validProductInput({
        name: `Producto insights ${productId}`,
        verifiedAt: new Date("2026-08-18T12:00:00Z"),
      }),
    ),
  });
  await connection.db.insert(prompts).values({
    name: "analyze_transcript",
    version: promptVersion,
    body: ANALYZE_TRANSCRIPT_PROMPT,
    active: true,
  });
});

afterAll(async () => {
  await connection.db.delete(trainingQuestions).where(eq(trainingQuestions.productId, productId));
  await connection.db.delete(products).where(eq(products.id, productId));
  await connection.db.delete(liveRecordings).where(eq(liveRecordings.advisorId, advisorId));
  await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
  await connection.db.delete(advisors).where(eq(advisors.id, otherAdvisorId));
  await connection.db.delete(prompts).where(eq(prompts.version, promptVersion));
  await connection.close();
});

describe("analyzeRecording", () => {
  it("pasa por analyzing, crea insights y termina en analyzed", async () => {
    const recordingId = await createRecording(
      "[Speaker 0] preguntan mucho si el producto es original y si el envio es gratis",
    );
    const { generate } = generator({
      insights: [
        {
          type: "faq",
          text: "preguntan si el producto es original",
          product_id: productId,
          frequency: 4,
          at_seconds: null,
        },
        {
          type: "objecion",
          text: "dudan del precio frente a otra marca",
          product_id: productId,
          frequency: 2,
          at_seconds: null,
        },
      ],
    });

    const result = await analyzeRecording(recordingId, { authorize, generate });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.insights).toHaveLength(2);

    const [recording] = await connection.db
      .select({ status: liveRecordings.status })
      .from(liveRecordings)
      .where(eq(liveRecordings.id, recordingId));
    expect(recording?.status).toBe("analyzed");

    const stored = await connection.db
      .select()
      .from(insights)
      .where(eq(insights.recordingId, recordingId));
    expect(stored).toHaveLength(2);
  });

  it("nunca envia PII de la transcripcion al modelo", async () => {
    const recordingId = await createRecording(
      "[Speaker 1] hola, me llamo Valentina y mi numero es 3001234567",
    );
    const { generate, seen } = generator({ insights: [] });

    const result = await analyzeRecording(recordingId, { authorize, generate });
    expect(result.ok).toBe(true);
    const sent = seen[0]?.messages[0]?.content ?? "";
    expect(sent).not.toContain("Valentina");
    expect(sent).not.toContain("3001234567");
    expect(sent).toContain(REDACTION_TOKENS.name);
  });

  it("no copia telefonos literales al texto del insight guardado", async () => {
    const recordingId = await createRecording("[Speaker 0] una clienta dejo su contacto");
    const { generate } = generator({
      insights: [
        {
          type: "faq",
          text: "varias clientas piden escribir al 3159876543 para asesoria",
          product_id: productId,
          frequency: 2,
          at_seconds: null,
        },
      ],
    });

    const result = await analyzeRecording(recordingId, { authorize, generate });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.redacted).toBe(1);
    const [stored] = await connection.db
      .select({ text: insights.text })
      .from(insights)
      .where(eq(insights.recordingId, recordingId));
    expect(stored?.text).not.toContain("3159876543");
    expect(stored?.text).toContain(REDACTION_TOKENS.phone);
  });

  it("rechaza una grabacion que todavia no tiene transcripcion", async () => {
    const recordingId = randomUUID();
    await connection.db.insert(liveRecordings).values({
      id: recordingId,
      advisorId,
      storagePath: `live-recordings/${recordingId}.mp4`,
      status: "uploaded",
      callbackToken: randomUUID(),
      expiresAt: new Date(Date.now() + 90 * 24 * 3_600_000),
    });
    const { generate } = generator({ insights: [] });
    const result = await analyzeRecording(recordingId, { authorize, generate });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFLICT");
  });

  it("no deja analizar la grabacion de otra asesora", async () => {
    const recordingId = randomUUID();
    await connection.db.insert(liveRecordings).values({
      id: recordingId,
      advisorId: otherAdvisorId,
      storagePath: `live-recordings/${recordingId}.mp4`,
      status: "transcribed",
      transcript: "[Speaker 0] contenido ajeno",
      callbackToken: randomUUID(),
      expiresAt: new Date(Date.now() + 90 * 24 * 3_600_000),
    });
    const { generate } = generator({ insights: [] });
    const result = await analyzeRecording(recordingId, { authorize, generate });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
    await connection.db.delete(liveRecordings).where(eq(liveRecordings.id, recordingId));
  });
});

describe("promoteInsight", () => {
  async function seedInsight(overrides: Partial<typeof insights.$inferInsert> = {}) {
    const recordingId = await createRecording("[Speaker 0] material de promocion");
    const [row] = await connection.db
      .insert(insights)
      .values({
        recordingId,
        type: "faq",
        text: `preguntan por la dosis diaria ${randomUUID().slice(0, 8)}`,
        productId,
        frequency: 3,
        ...overrides,
      })
      .returning();
    if (!row) throw new Error("no se creo el insight");
    return row;
  }

  it("crea la pregunta con source live_insight y enlaza ambos registros", async () => {
    const insight = await seedInsight();
    const result = await promoteInsight(insight.id, { authorize });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.created).toBe(true);
    expect(result.data.question.source).toBe("live_insight");
    expect(result.data.question.text).toBe(insight.text);

    const [linked] = await connection.db
      .select({ promotedToQuestionId: insights.promotedToQuestionId })
      .from(insights)
      .where(eq(insights.id, insight.id));
    expect(linked?.promotedToQuestionId).toBe(result.data.question.id);
  });

  it("es idempotente: la segunda promocion devuelve la misma pregunta", async () => {
    const insight = await seedInsight();
    const first = await promoteInsight(insight.id, { authorize });
    const second = await promoteInsight(insight.id, { authorize });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.data.created).toBe(false);
    expect(second.data.question.id).toBe(first.data.question.id);

    const rows = await connection.db
      .select({ id: trainingQuestions.id })
      .from(trainingQuestions)
      .where(eq(trainingQuestions.text, insight.text));
    expect(rows).toHaveLength(1);
  });

  it("no promueve un tipo que no es material de practica", async () => {
    const insight = await seedInsight({ type: "riesgo_claim" });
    const result = await promoteInsight(insight.id, { authorize });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFLICT");
  });

  it("no promueve un insight sin producto asociado", async () => {
    const insight = await seedInsight({ productId: null });
    const result = await promoteInsight(insight.id, { authorize });
    expect(result.ok).toBe(false);
  });

  it("no arrastra PII a la pregunta promovida", async () => {
    const insight = await seedInsight({
      text: "preguntan si pueden escribir al 3209876543 por WhatsApp",
    });
    const result = await promoteInsight(insight.id, { authorize });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.question.text).not.toContain("3209876543");
    expect(result.data.question.text).toContain(REDACTION_TOKENS.phone);
  });
});
