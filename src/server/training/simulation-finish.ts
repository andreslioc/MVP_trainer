/**
 * Cierre de un simulacro: del audio a las notas.
 *
 * Reusa entero el analisis de Live Intelligence. El chat del simulacro sale en
 * el formato que `parseChatLog` lee y la transcripcion trae marcas [Xs], asi que
 * `collectChatCoverage` responde "la contesto y en que segundo" sin cambiarle
 * una linea. Lo que aqui NO hace falta es buscar las preguntas: las inyectamos,
 * y por eso el guion es la verdad contra la que se mide la reaccion.
 */

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../db/client.ts";
import { liveSimulations, products, prompts, trainingQuestions } from "../../db/schema.ts";
import { createAiGateway } from "../../lib/ai/gateway.ts";
import { buildEvaluateAnswerPrompt } from "../../lib/ai/prompts/evaluate-answer.ts";
import { type Evaluation, evaluationSchema } from "../../lib/ai/schemas.ts";
import { generateStructured } from "../../lib/ai/structured.ts";
import { type AdvisorRole, requireRole } from "../../lib/auth.ts";
import { mapWithConcurrency } from "../../lib/concurrency.ts";
import { logFailure } from "../../lib/log.ts";
import { AI_PROVIDER } from "../../lib/ai/config.ts";
import { collectChatCoverage } from "../recordings/chat-coverage.ts";
import { writeLlmCall } from "../llm-calls.ts";

const aiGateway = createAiGateway({ writeCall: writeLlmCall });

type FinishDatabase = Pick<typeof db, "select" | "update">;
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };

export type FinishDependencies = {
  database?: FinishDatabase;
  authorize?: (role: AdvisorRole) => Promise<AuthorizationResult>;
  /** Devuelve la transcripcion con marcas [Xs] del audio de la asesora. */
  transcribe?: (audio: {
    audio: ArrayBuffer;
    contentType: string;
  }) => Promise<
    { ok: true; data: { transcript: string } } | { ok: false; error: { message: string } }
  >;
  generate?: typeof generateStructured;
};

/**
 * Solo las lineas del guion entran al analisis de cobertura.
 *
 * El relleno no se evalua: nadie tiene que contestar un "hola". Mandarlo
 * costaria tokens para producir filas que despues habria que descartar.
 */
function questionsAsChatLog(script: Array<{ question_id: string; at_ms: number; text: string }>) {
  return script
    .slice()
    .sort((a, b) => a.at_ms - b.at_ms)
    .map((entry) => {
      const total = Math.floor(entry.at_ms / 1000);
      const stamp = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
        .map((part) => String(part).padStart(2, "0"))
        .join(":");
      return `[${stamp}] @viewer: ${entry.text}`;
    })
    .join("\n");
}

export async function finishSimulation(
  input: { simulationId: string; audio: ArrayBuffer; contentType: string },
  options: FinishDependencies = {},
) {
  const database = options.database ?? db;
  const authorize = options.authorize ?? requireRole;
  const generate = options.generate ?? generateStructured;

  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;
  if (!z.uuid().safeParse(input.simulationId).success) {
    return { ok: false as const, error: { code: "VALIDATION", message: "Simulacro invalido." } };
  }

  try {
    const [simulation] = await database
      .select({
        id: liveSimulations.id,
        script: liveSimulations.script,
        durationS: liveSimulations.durationS,
      })
      .from(liveSimulations)
      .where(
        and(
          eq(liveSimulations.id, input.simulationId),
          eq(liveSimulations.advisorId, authorization.data.id),
        ),
      )
      .limit(1);
    if (!simulation) {
      return {
        ok: false as const,
        error: { code: "NOT_FOUND", message: "El simulacro no existe." },
      };
    }

    const transcribe = options.transcribe ?? (await defaultTranscriber());
    const transcribed = await transcribe({ audio: input.audio, contentType: input.contentType });
    if (!transcribed.ok) {
      return {
        ok: false as const,
        error: { code: "TRANSCRIPTION_FAILED", message: transcribed.error.message },
      };
    }

    const [coveragePrompt] = await database
      .select({ id: prompts.id })
      .from(prompts)
      .where(and(eq(prompts.name, "chat_coverage"), eq(prompts.active, true)))
      .limit(1);
    if (!coveragePrompt) {
      return {
        ok: false as const,
        error: { code: "PROMPT_MISSING", message: "Falta el prompt de cobertura." },
      };
    }

    const coverage = await collectChatCoverage(
      {
        advisorId: authorization.data.id,
        promptId: coveragePrompt.id,
        chatLog: questionsAsChatLog(simulation.script),
        transcript: transcribed.data.transcript,
        durationS: simulation.durationS,
      },
      (payload) => generateStructured(payload, aiGateway),
    );

    const questionRows = await database
      .select({
        id: trainingQuestions.id,
        text: trainingQuestions.text,
        idealAnswer: trainingQuestions.idealAnswer,
        criteria: trainingQuestions.criteria,
        productId: trainingQuestions.productId,
      })
      .from(trainingQuestions)
      .where(
        inArray(
          trainingQuestions.id,
          simulation.script.map((entry) => entry.question_id),
        ),
      );

    const productRows = await database
      .select()
      .from(products)
      .where(
        inArray(
          products.id,
          questionRows.map((question) => question.productId),
        ),
      );

    const [evaluatePrompt] = await database
      .select({ id: prompts.id })
      .from(prompts)
      .where(and(eq(prompts.name, "evaluate_answer"), eq(prompts.active, true)))
      .limit(1);

    // Solo se evalua lo que si contesto. Puntuar una respuesta vacia produce
    // nueve ceros que no le dicen nada a nadie; que no la vio ya lo dice la
    // metrica de atencion.
    const results = await mapWithConcurrency(
      simulation.script,
      AI_PROVIDER.maxConcurrency,
      async (entry) => {
        const appearedAtS = Math.round(entry.at_ms / 1000);
        const row = coverage.rows.find((candidate) => candidate.question === entry.text);
        const question = questionRows.find((candidate) => candidate.id === entry.question_id);
        const product = productRows.find((candidate) => candidate.id === question?.productId);
        const answered = Boolean(row?.answered);
        const answeredAtS = answered ? (row?.atSeconds ?? null) : null;

        let scores: Evaluation["scores"] | null = null;
        let feedback: string | null = null;
        if (answered && row?.evidenceQuote && question && product && evaluatePrompt) {
          const rendered = buildEvaluateAnswerPrompt({
            product,
            question: {
              text: question.text,
              idealAnswer: question.idealAnswer,
              criteria: question.criteria,
            },
            advisorAnswer: row.evidenceQuote,
          });
          const evaluated = await generate(
            {
              advisorId: authorization.data.id,
              purpose: "simulation_evaluate",
              promptId: evaluatePrompt.id,
              schema: evaluationSchema,
              system: rendered.system,
              messages: rendered.messages,
              maxTokens: 3_000,
              effort: "medium",
            },
            aiGateway,
          );
          if (evaluated.ok) {
            scores = evaluated.data.value.scores;
            feedback = evaluated.data.value.feedback;
          }
        }

        return {
          question_id: entry.question_id,
          appeared_at_s: appearedAtS,
          answered,
          answered_at_s: answeredAtS,
          reaction_s: answeredAtS === null ? null : Math.max(0, answeredAtS - appearedAtS),
          advisor_answer: row?.evidenceQuote ?? null,
          scores,
          feedback,
        };
      },
    );

    const [updated] = await database
      .update(liveSimulations)
      .set({ transcript: transcribed.data.transcript, results, finishedAt: new Date() })
      .where(eq(liveSimulations.id, simulation.id))
      .returning();

    return { ok: true as const, data: updated };
  } catch (error) {
    logFailure("finishSimulation", error);
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudo cerrar el simulacro." },
    };
  }
}

/** Groq por defecto: cinco minutos de audio a bitrate bajo no necesitan ffmpeg. */
async function defaultTranscriber() {
  const { transcribeWithGroq } = await import("../recordings/groq.ts");
  return async (audio: { audio: ArrayBuffer; contentType: string }) => {
    const result = await transcribeWithGroq(audio);
    return result.ok
      ? { ok: true as const, data: { transcript: result.data.transcript } }
      : { ok: false as const, error: { message: result.error.message } };
  };
}
