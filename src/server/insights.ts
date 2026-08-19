import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/client.ts";
import {
  chatCoverage,
  insights,
  liveRecordings,
  products,
  trainingQuestions,
} from "../db/schema.ts";
import { containsPii, redactPii } from "../lib/ai/prompts/analyze-transcript.ts";
import { type AdvisorRole, requireRole } from "../lib/auth.ts";
import { INTENT_BY_PROMOTABLE_TYPE, isPromotable } from "../lib/insights.ts";
import { logFailure } from "../lib/log.ts";

type InsightsDatabase = Pick<typeof db, "select" | "transaction">;
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };
type Authorize = (role: AdvisorRole) => Promise<AuthorizationResult>;

export type InsightsDependencies = {
  authorize?: Authorize;
  database?: InsightsDatabase;
};

function dependencies(options: InsightsDependencies) {
  return {
    authorize: options.authorize ?? requireRole,
    database: options.database ?? db,
  };
}

function parseUuid(value: string, field: string) {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { code: "VALIDATION", message: "El identificador no es válido.", field },
    };
  }
  return { ok: true as const, data: parsed.data };
}

export async function listInsights(recordingId: string, options: InsightsDependencies = {}) {
  const { authorize, database } = dependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;
  const parsedId = parseUuid(recordingId, "recordingId");
  if (!parsedId.ok) return parsedId;

  try {
    const rows = await database
      .select({
        id: insights.id,
        type: insights.type,
        text: insights.text,
        productId: insights.productId,
        productName: products.name,
        frequency: insights.frequency,
        atSeconds: insights.atSeconds,
        promotedToQuestionId: insights.promotedToQuestionId,
      })
      .from(insights)
      .innerJoin(liveRecordings, eq(liveRecordings.id, insights.recordingId))
      .leftJoin(products, eq(products.id, insights.productId))
      .where(
        and(
          eq(insights.recordingId, parsedId.data),
          eq(liveRecordings.advisorId, authorization.data.id),
        ),
      )
      .orderBy(desc(insights.frequency));
    return { ok: true as const, data: rows };
  } catch (error) {
    logFailure("listInsights", error);
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudieron cargar los hallazgos." },
    };
  }
}

/**
 * Promueve un insight a pregunta de entrenamiento.
 *
 * Idempotente y atómico. La fila del insight se bloquea con `for update` dentro
 * de la transacción, así que dos promociones simultáneas del mismo insight
 * serializan: la segunda lee `promotedToQuestionId` ya escrito y devuelve la
 * pregunta existente en vez de duplicar material de entrenamiento.
 */
export async function promoteInsight(insightId: string, options: InsightsDependencies = {}) {
  const { authorize, database } = dependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;
  const parsedId = parseUuid(insightId, "insightId");
  if (!parsedId.ok) return parsedId;

  try {
    return await database.transaction(async (tx) => {
      const [insight] = await tx
        .select({
          id: insights.id,
          type: insights.type,
          text: insights.text,
          productId: insights.productId,
          promotedToQuestionId: insights.promotedToQuestionId,
        })
        .from(insights)
        .innerJoin(liveRecordings, eq(liveRecordings.id, insights.recordingId))
        .where(
          and(eq(insights.id, parsedId.data), eq(liveRecordings.advisorId, authorization.data.id)),
        )
        .limit(1)
        .for("update", { of: insights });
      if (!insight) {
        return {
          ok: false as const,
          error: { code: "NOT_FOUND", message: "El hallazgo no existe." },
        };
      }

      if (insight.promotedToQuestionId) {
        const [existing] = await tx
          .select()
          .from(trainingQuestions)
          .where(eq(trainingQuestions.id, insight.promotedToQuestionId))
          .limit(1);
        if (!existing) {
          return {
            ok: false as const,
            error: { code: "INTERNAL", message: "La pregunta enlazada ya no existe." },
          };
        }
        return { ok: true as const, data: { question: existing, created: false } };
      }

      if (!isPromotable(insight) || !insight.productId) {
        return {
          ok: false as const,
          error: {
            code: "CONFLICT",
            message: "Solo se promueven preguntas y objeciones con producto asociado.",
          },
        };
      }

      const text = redactPii(insight.text).trim();
      if (!text || containsPii(text)) {
        return {
          ok: false as const,
          error: {
            code: "CONFLICT",
            message: "El hallazgo contiene datos personales y no puede promoverse.",
          },
        };
      }

      const [inserted] = await tx
        .insert(trainingQuestions)
        .values({
          productId: insight.productId,
          text,
          intent: INTENT_BY_PROMOTABLE_TYPE[insight.type as "faq" | "objecion"],
          difficulty: "intermedia",
          // La respuesta ideal no se inventa aquí: se obliga a responder desde
          // la ficha, que es la única fuente de verdad del sistema.
          idealAnswer:
            "Responde únicamente con datos verificados de la ficha del producto en el Knowledge Hub.",
          criteria: [
            "Responde solo con datos de la ficha",
            "No promete resultados ni efectos terapéuticos",
            "Deriva a consulta profesional si toca embarazo, lactancia, medicamentos o enfermedad",
          ],
          source: "live_insight" as const,
        })
        // El índice único (product_id, text) puede haber sido creado por otra
        // vía; en ese caso enlazamos la pregunta existente, no fallamos.
        .onConflictDoNothing({ target: [trainingQuestions.productId, trainingQuestions.text] })
        .returning();

      const question =
        inserted ??
        (
          await tx
            .select()
            .from(trainingQuestions)
            .where(
              and(
                eq(trainingQuestions.productId, insight.productId),
                eq(trainingQuestions.text, text),
              ),
            )
            .limit(1)
        )[0];
      if (!question) throw new Error("No se pudo resolver la pregunta promovida.");

      await tx
        .update(insights)
        .set({ promotedToQuestionId: question.id })
        .where(eq(insights.id, insight.id));

      return { ok: true as const, data: { question, created: Boolean(inserted) } };
    });
  } catch (error) {
    logFailure("promoteInsight", error);
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudo promover el hallazgo." },
    };
  }
}

export async function listChatCoverage(recordingId: string, options: InsightsDependencies = {}) {
  const { authorize, database } = dependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;

  try {
    const [recording] = await database
      .select({ id: liveRecordings.id })
      .from(liveRecordings)
      .where(
        and(
          eq(liveRecordings.id, recordingId),
          eq(liveRecordings.advisorId, authorization.data.id),
        ),
      )
      .limit(1);

    if (!recording) {
      return {
        ok: false as const,
        error: { code: "NOT_FOUND", message: "La grabación no existe." },
      };
    }

    const rows = await database
      .select({
        id: chatCoverage.id,
        question: chatCoverage.question,
        answered: chatCoverage.answered,
        evidenceQuote: chatCoverage.evidenceQuote,
        atSeconds: chatCoverage.atSeconds,
      })
      .from(chatCoverage)
      .where(eq(chatCoverage.recordingId, recordingId));

    return { ok: true as const, data: rows };
  } catch (error) {
    logFailure("listChatCoverage", error);
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudieron cargar las preguntas del chat." },
    };
  }
}
