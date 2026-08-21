import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../db/client.ts";
import { chatCoverage, insights, liveRecordings, products, prompts } from "../../db/schema.ts";
import { createAiGateway } from "../../lib/ai/gateway.ts";
import {
  buildAnalyzeTranscriptPrompt,
  containsPii,
  hasSubstance,
  redactPii,
} from "../../lib/ai/prompts/analyze-transcript.ts";
import { type TranscriptInsights, transcriptInsightsSchema } from "../../lib/ai/schemas.ts";
import {
  generateStructured,
  type StructuredOutputInput,
  type StructuredOutputResult,
} from "../../lib/ai/structured.ts";
import { type AdvisorRole, requireRole } from "../../lib/auth.ts";
import { type ChatCoverageOutcome, collectChatCoverage } from "./chat-coverage.ts";
import { writeLlmCall } from "../llm-calls.ts";
import { logFailure } from "../../lib/log.ts";

type AnalyzeDatabase = Pick<typeof db, "select" | "update" | "transaction">;
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };
type Authorize = (role: AdvisorRole) => Promise<AuthorizationResult>;
type Generate = (
  input: StructuredOutputInput<TranscriptInsights>,
) => Promise<StructuredOutputResult<TranscriptInsights>>;

type CollectCoverage = typeof collectChatCoverage;

export type AnalyzeDependencies = {
  authorize?: Authorize;
  database?: AnalyzeDatabase;
  generate?: Generate;
  generateCoverage?: Parameters<CollectCoverage>[1];
};

const aiGateway = createAiGateway({ writeCall: writeLlmCall });

async function defaultGenerate(input: Parameters<Generate>[0]) {
  return generateStructured(input, aiGateway);
}

async function defaultGenerateCoverage(input: Parameters<Parameters<CollectCoverage>[1]>[0]) {
  return generateStructured(input, aiGateway);
}

function dependencies(options: AnalyzeDependencies) {
  return {
    authorize: options.authorize ?? requireRole,
    database: options.database ?? db,
    generate: options.generate ?? defaultGenerate,
    generateCoverage: options.generateCoverage ?? defaultGenerateCoverage,
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
export function sanitizeInsights(
  value: TranscriptInsights,
  allowedProductIds: ReadonlySet<string>,
) {
  const kept: Array<{
    type: TranscriptInsights["insights"][number]["type"];
    text: string;
    productId: string | null;
    frequency: number;
    atSeconds: number | null;
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
    kept.push({
      type: insight.type,
      text,
      productId,
      frequency: insight.frequency,
      atSeconds: insight.at_seconds,
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
  const { authorize, database, generate, generateCoverage } = dependencies(options);
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

    const activePrompts = await database
      .select({ id: prompts.id, name: prompts.name })
      .from(prompts)
      .where(
        and(
          inArray(prompts.name, ["analyze_transcript", "chat_coverage"]),
          eq(prompts.active, true),
        ),
      )
      .orderBy(desc(prompts.version));
    const analyzePromptId = activePrompts.find((row) => row.name === "analyze_transcript")?.id;
    const coveragePromptId = activePrompts.find((row) => row.name === "chat_coverage")?.id;
    if (!analyzePromptId) {
      throw new Error("No existe un prompt activo para analizar transcripciones.");
    }

    // El chat NO entra a esta llamada. Los hallazgos salen de la transcripcion;
    // la cobertura de chat corre aparte y por lotes, porque compartir llamada
    // hacia que el modelo procesara los primeros minutos del chat y parara.
    const rendered = buildAnalyzeTranscriptPrompt({
      transcript: recording.transcript,
      durationS: recording.durationS,
      products: catalog,
    });
    const generated = await generate({
      advisorId: authorization.data.id,
      purpose: "analyze_transcript",
      promptId: analyzePromptId,
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

    const coverage: ChatCoverageOutcome =
      recording.chatLog && coveragePromptId
        ? await collectChatCoverage(
            {
              advisorId: authorization.data.id,
              promptId: coveragePromptId,
              chatLog: recording.chatLog,
              transcript: recording.transcript,
              durationS: recording.durationS,
            },
            generateCoverage,
          )
        : {
            rows: [],
            droppedNoise: 0,
            questionCount: 0,
            notQuestions: 0,
            batches: 0,
            failedBatches: 0,
            lagS: null,
            chatBeyondAudioS: null,
          };

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
                  atSeconds: insight.atSeconds,
                })),
              )
              .returning();
      const chatRows =
        coverage.rows.length === 0
          ? []
          : await tx
              .insert(chatCoverage)
              .values(
                coverage.rows.map((item) => ({
                  recordingId: recording.id,
                  question: item.question,
                  answered: item.answered,
                  evidenceQuote: item.evidenceQuote,
                  atSeconds: item.atSeconds,
                  askedCount: item.askedCount,
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
        coverage: {
          questionCount: coverage.questionCount,
          notQuestions: coverage.notQuestions,
          droppedNoise: coverage.droppedNoise,
          batches: coverage.batches,
          // Mayor que cero significa que la cobertura guardada es PARCIAL.
          failedBatches: coverage.failedBatches,
          // Desfase medido entre el reloj del chat y el del audio.
          lagS: coverage.lagS,
          chatBeyondAudioS: coverage.chatBeyondAudioS,
        },
      },
    };
  } catch (error) {
    logFailure("analyzeRecording", error);
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
        title: liveRecordings.title,
        status: liveRecordings.status,
        durationS: liveRecordings.durationS,
        createdAt: liveRecordings.createdAt,
        // Solo el booleano: el texto se pide aparte cuando alguien lo abre.
        // Una transcripcion de dos horas pesa 144 KB y traer la de todas las
        // grabaciones en cada carga costaria mas que el resto de la pantalla.
        hasTranscript: sql<boolean>`${liveRecordings.transcript} is not null`,
        hasChatLog: sql<boolean>`${liveRecordings.chatLog} is not null`,
      })
      .from(liveRecordings)
      .where(eq(liveRecordings.advisorId, authorization.data.id))
      .orderBy(desc(liveRecordings.createdAt));
    return { ok: true as const, data: rows };
  } catch (error) {
    logFailure("listAnalyzableRecordings", error);
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudieron cargar las grabaciones." },
    };
  }
}
