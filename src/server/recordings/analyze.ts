import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../db/client.ts";
import { chatCoverage, insights, liveRecordings, products, prompts } from "../../db/schema.ts";
import { createAiGateway } from "../../lib/ai/gateway.ts";
import {
  buildAnalyzeTranscriptPrompt,
  containsPii,
  redactPii,
  REDACTION_TOKENS,
} from "../../lib/ai/prompts/analyze-transcript.ts";
import { type TranscriptInsights, transcriptInsightsSchema } from "../../lib/ai/schemas.ts";
import {
  generateStructured,
  type StructuredOutputInput,
  type StructuredOutputResult,
} from "../../lib/ai/structured.ts";
import { type AdvisorRole, requireRole } from "../../lib/auth.ts";
import { writeLlmCall } from "../llm-calls.ts";

type AnalyzeDatabase = Pick<typeof db, "select" | "update" | "transaction">;
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };
type Authorize = (role: AdvisorRole) => Promise<AuthorizationResult>;
type Generate = (
  input: StructuredOutputInput<TranscriptInsights>,
) => Promise<StructuredOutputResult<TranscriptInsights>>;

export type AnalyzeDependencies = {
  authorize?: Authorize;
  database?: AnalyzeDatabase;
  generate?: Generate;
};

const aiGateway = createAiGateway({ writeCall: writeLlmCall });

async function defaultGenerate(input: Parameters<Generate>[0]) {
  return generateStructured(input, aiGateway);
}

function dependencies(options: AnalyzeDependencies) {
  return {
    authorize: options.authorize ?? requireRole,
    database: options.database ?? db,
    generate: options.generate ?? defaultGenerate,
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

/**
 * Segunda pasada de redacción, ya sobre la salida del modelo. La transcripción
 * entró redactada, pero el modelo puede reconstruir un identificador.
 *
 * La política es redactar y conservar, no descartar: un hallazgo que decía
 * "escribir al 3001234567" sigue siendo un hallazgo útil como "escribir al
 * [telefono]", y tirarlo perdería la señal sin ganar privacidad. Solo se
 * descarta lo que después de redactar no conserva ninguna sustancia propia:
 * un texto que era solo un teléfono queda solo como token y no dice nada.
 * `redacted` cuenta los que traían PII en crudo, porque un modelo que filtra
 * identificadores es una señal que vale la pena ver.
 */
/** Queda algo legible una vez retirados los tokens de redaccion. */
function hasSubstance(text: string) {
  const withoutTokens = Object.values(REDACTION_TOKENS).reduce(
    (accumulator, token) => accumulator.split(token).join(" "),
    text,
  );
  return /\p{L}|\p{N}/u.test(withoutTokens);
}

export function sanitizeInsights(
  value: TranscriptInsights,
  allowedProductIds: ReadonlySet<string>,
) {
  const kept: Array<{
    type: TranscriptInsights["insights"][number]["type"];
    text: string;
    productId: string | null;
    frequency: number;
  }> = [];
  let discarded = 0;
  let redacted = 0;

  for (const insight of value.insights) {
    if (containsPii(insight.text)) redacted += 1;
    const text = redactPii(insight.text).trim();
    if (!hasSubstance(text)) {
      discarded += 1;
      continue;
    }
    const productId =
      insight.product_id && allowedProductIds.has(insight.product_id) ? insight.product_id : null;
    kept.push({ type: insight.type, text, productId, frequency: insight.frequency });
  }

  return { kept, discarded, redacted };
}

/**
 * Sanitiza la cobertura de chat aplicando la misma lógica de redacción y descarte que sanitizeInsights.
 * Una pregunta que contiene PII tras redactar se descarta, y una pregunta que queda vacía se descarta.
 */
function sanitizeChatCoverage(value: TranscriptInsights["chat_coverage"]) {
  if (!value || !Array.isArray(value)) return { kept: [], discarded: 0, redacted: 0 };

  const kept: Array<{
    question: string;
    answered: boolean;
    evidenceQuote: string | null;
  }> = [];
  let discarded = 0;
  let redacted = 0;

  for (const item of value) {
    const questionContainsPii = containsPii(item.question);
    if (questionContainsPii) redacted += 1;

    const question = redactPii(item.question).trim();
    if (!hasSubstance(question)) {
      discarded += 1;
      continue;
    }

    const evidenceContainsPii = item.evidence_quote ? containsPii(item.evidence_quote) : false;
    if (evidenceContainsPii) redacted += 1;

    const evidenceQuote = item.evidence_quote ? redactPii(item.evidence_quote).trim() : null;
    if (evidenceQuote && !hasSubstance(evidenceQuote)) {
      discarded += 1;
      continue;
    }

    kept.push({
      question,
      answered: item.answered,
      evidenceQuote: evidenceQuote || null,
    });
  }

  return { kept, discarded, redacted };
}

/**
 * Analiza una grabación transcrita y persiste sus insights.
 *
 * La transición `transcribed → analyzing` es condicional y por eso sirve de
 * cerrojo: dos ejecuciones simultáneas sobre la misma grabación no producen
 * dos tandas de insights, porque la segunda no encuentra la fila en estado
 * `transcribed`.
 */
export async function analyzeRecording(recordingId: string, options: AnalyzeDependencies = {}) {
  const { authorize, database, generate } = dependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;
  const parsedId = parseUuid(recordingId, "recordingId");
  if (!parsedId.ok) return parsedId;

  const [recording] = await database
    .select({
      id: liveRecordings.id,
      status: liveRecordings.status,
      transcript: liveRecordings.transcript,
      chatLog: liveRecordings.chatLog,
      durationS: liveRecordings.durationS,
    })
    .from(liveRecordings)
    .where(
      and(
        eq(liveRecordings.id, parsedId.data),
        eq(liveRecordings.advisorId, authorization.data.id),
      ),
    )
    .limit(1);
  if (!recording) {
    return { ok: false as const, error: { code: "NOT_FOUND", message: "La grabación no existe." } };
  }
  if (recording.status === "analyzed") {
    return {
      ok: false as const,
      error: { code: "CONFLICT", message: "Esta grabación ya fue analizada." },
    };
  }
  if (recording.status !== "transcribed" || !recording.transcript) {
    return {
      ok: false as const,
      error: { code: "CONFLICT", message: "La grabación todavía no tiene transcripción." },
    };
  }

  const claimed = await database
    .update(liveRecordings)
    .set({ status: "analyzing" })
    .where(and(eq(liveRecordings.id, recording.id), eq(liveRecordings.status, "transcribed")))
    .returning({ id: liveRecordings.id });
  if (claimed.length === 0) {
    return {
      ok: false as const,
      error: { code: "CONFLICT", message: "Otro análisis ya está en curso." },
    };
  }

  try {
    const catalog = await database
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(isNotNull(products.verifiedAt))
      .orderBy(asc(products.name));

    const [prompt] = await database
      .select({ id: prompts.id })
      .from(prompts)
      .where(and(eq(prompts.name, "analyze_transcript"), eq(prompts.active, true)))
      .orderBy(desc(prompts.version))
      .limit(1);
    if (!prompt) {
      throw new Error("No existe un prompt activo para analizar transcripciones.");
    }

    const rendered = buildAnalyzeTranscriptPrompt({
      transcript: recording.transcript,
      chatLog: recording.chatLog,
      durationS: recording.durationS,
      products: catalog,
    });
    const generated = await generate({
      advisorId: authorization.data.id,
      purpose: "analyze_transcript",
      promptId: prompt.id,
      schema: transcriptInsightsSchema,
      system: rendered.system,
      messages: rendered.messages,
      maxTokens: 8_000,
      effort: "high",
    });
    if (!generated.ok) throw new Error(generated.error.message);

    const sanitized = sanitizeInsights(
      generated.data.value,
      new Set(catalog.map((product) => product.id)),
    );

    const sanitizedChat = sanitizeChatCoverage(generated.data.value.chat_coverage);

    const saved = await database.transaction(async (tx) => {
      const rows =
        sanitized.kept.length === 0
          ? []
          : await tx
              .insert(insights)
              .values(
                sanitized.kept.map((insight) => ({
                  recordingId: recording.id,
                  type: insight.type,
                  text: insight.text,
                  productId: insight.productId,
                  frequency: insight.frequency,
                })),
              )
              .returning();
      const chatRows =
        sanitizedChat.kept.length === 0
          ? []
          : await tx
              .insert(chatCoverage)
              .values(
                sanitizedChat.kept.map((item) => ({
                  recordingId: recording.id,
                  question: item.question,
                  answered: item.answered,
                  evidenceQuote: item.evidenceQuote,
                })),
              )
              .returning();
      await tx
        .update(liveRecordings)
        .set({ status: "analyzed" })
        .where(eq(liveRecordings.id, recording.id));
      return { insights: rows, chatCoverage: chatRows };
    });

    return {
      ok: true as const,
      data: {
        insights: saved.insights,
        chatCoverage: saved.chatCoverage,
        discarded: sanitized.discarded,
        redacted: sanitized.redacted,
      },
    };
  } catch {
    await database
      .update(liveRecordings)
      .set({ status: "failed" })
      .where(and(eq(liveRecordings.id, recording.id), eq(liveRecordings.status, "analyzing")));
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudo analizar la grabación." },
    };
  }
}

/**
 * Grabaciones de la asesora con su estado de análisis, para la pantalla de
 * Live Intelligence. Solo las propias: el aislamiento por `advisor_id` es
 * explícito aquí porque el servidor conecta saltando RLS (§8).
 */
export async function listAnalyzableRecordings(options: AnalyzeDependencies = {}) {
  const { authorize, database } = dependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;

  try {
    const rows = await database
      .select({
        id: liveRecordings.id,
        status: liveRecordings.status,
        durationS: liveRecordings.durationS,
        createdAt: liveRecordings.createdAt,
      })
      .from(liveRecordings)
      .where(eq(liveRecordings.advisorId, authorization.data.id))
      .orderBy(desc(liveRecordings.createdAt));
    return { ok: true as const, data: rows };
  } catch {
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudieron cargar las grabaciones." },
    };
  }
}
