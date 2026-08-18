import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../db/client.ts";
import {
  products,
  prompts,
  trainingAnswers,
  trainingQuestions,
  trainingSessions,
} from "../../db/schema.ts";
import { createAiGateway } from "../../lib/ai/gateway.ts";
import { buildEvaluateAnswerPrompt } from "../../lib/ai/prompts/evaluate-answer.ts";
import { type Evaluation, evaluationSchema } from "../../lib/ai/schemas.ts";
import {
  generateStructured,
  type StructuredOutputInput,
  type StructuredOutputResult,
} from "../../lib/ai/structured.ts";
import { type AdvisorRole, requireRole } from "../../lib/auth.ts";
import { writeLlmCall } from "../llm-calls.ts";

const evaluationInputSchema = z
  .object({
    sessionId: z.uuid(),
    questionId: z.uuid(),
    advisorAnswer: z.string().trim().min(1).max(5_000),
  })
  .strict();

type EvaluationDatabase = Pick<typeof db, "insert" | "select" | "update">;
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };
type Generate = (
  input: StructuredOutputInput<Evaluation>,
) => Promise<StructuredOutputResult<Evaluation>>;

export type EvaluationDependencies = {
  authorize?: (role: AdvisorRole) => Promise<AuthorizationResult>;
  database?: EvaluationDatabase;
  generate?: Generate;
};

const aiGateway = createAiGateway({ writeCall: writeLlmCall });

async function defaultGenerate(input: Parameters<Generate>[0]) {
  return generateStructured(input, aiGateway);
}

function recoverableError(answerId: string) {
  return {
    ok: false as const,
    error: {
      code: "EVALUATION_PENDING",
      message: "Tu respuesta quedo guardada, pero no pudimos evaluarla. Puedes reintentar.",
      recoverable: true as const,
      answerId,
    },
  };
}

export async function evaluateTrainingAnswer(input: unknown, options: EvaluationDependencies = {}) {
  const authorize = options.authorize ?? requireRole;
  const database = options.database ?? db;
  const generate = options.generate ?? defaultGenerate;
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;

  const parsed = evaluationInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { code: "VALIDATION", message: "Escribe una respuesta valida antes de evaluarla." },
    };
  }

  let savedAnswerId: string | undefined;
  try {
    const [context] = await database
      .select({ session: trainingSessions, question: trainingQuestions, product: products })
      .from(trainingSessions)
      .innerJoin(products, eq(products.id, trainingSessions.productId))
      .innerJoin(
        trainingQuestions,
        and(
          eq(trainingQuestions.id, parsed.data.questionId),
          eq(trainingQuestions.productId, trainingSessions.productId),
        ),
      )
      .where(
        and(
          eq(trainingSessions.id, parsed.data.sessionId),
          eq(trainingSessions.advisorId, authorization.data.id),
        ),
      )
      .limit(1);
    if (!context) {
      return { ok: false as const, error: { code: "NOT_FOUND", message: "La sesion no existe." } };
    }

    const [answer] = await database
      .insert(trainingAnswers)
      .values({
        sessionId: context.session.id,
        questionId: context.question.id,
        advisorAnswer: parsed.data.advisorAnswer,
      })
      .returning();
    if (!answer) throw new Error("No se guardo la respuesta.");
    savedAnswerId = answer.id;

    const [prompt] = await database
      .select({ id: prompts.id })
      .from(prompts)
      .where(and(eq(prompts.name, "evaluate_answer"), eq(prompts.active, true)))
      .orderBy(desc(prompts.version))
      .limit(1);
    if (!prompt) return recoverableError(answer.id);

    const rendered = buildEvaluateAnswerPrompt({
      product: context.product,
      question: context.question,
      advisorAnswer: answer.advisorAnswer,
    });
    const generated = await generate({
      advisorId: authorization.data.id,
      purpose: "evaluate_answer",
      promptId: prompt.id,
      schema: evaluationSchema,
      system: rendered.system,
      messages: rendered.messages,
      maxTokens: 4_000,
      effort: "high",
    });
    if (!generated.ok) return recoverableError(answer.id);

    const evaluation = evaluationSchema.safeParse(generated.data.value);
    if (!evaluation.success) return recoverableError(answer.id);

    const [completed] = await database
      .update(trainingAnswers)
      .set({
        scores: evaluation.data.scores,
        feedback: evaluation.data.feedback,
        improvedAnswer: evaluation.data.improved_answer,
      })
      .where(eq(trainingAnswers.id, answer.id))
      .returning();
    if (!completed) return recoverableError(answer.id);

    return { ok: true as const, data: completed };
  } catch {
    if (savedAnswerId) return recoverableError(savedAnswerId);
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudo guardar la respuesta para evaluarla." },
    };
  }
}
