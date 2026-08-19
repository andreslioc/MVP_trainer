import { z } from "zod";

export const questionIntentSchema = z.enum([
  "informacion",
  "comparacion",
  "precio",
  "confianza",
  "uso",
  "compra",
  "seguridad",
  "objecion",
]);

export const questionDifficultySchema = z.enum(["basica", "intermedia", "dificil"]);

export const generatedQuestionSchema = z
  .object({
    text: z.string().trim().min(1),
    intent: questionIntentSchema,
    difficulty: questionDifficultySchema,
    ideal_answer: z.string().trim().min(1),
    criteria: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

export const generatedQuestionsSchema = z
  .object({
    questions: z.array(generatedQuestionSchema).length(6),
  })
  .strict();

const dimensionScoreSchema = z
  .object({
    score: z.number().int().min(1).max(5),
    reason: z.string().trim().min(1),
  })
  .strict();

export const evaluationDimensionKeys = [
  "conocimiento_producto",
  "claridad_explicacion",
  "naturalidad_cercania",
  "uso_responsable_evidencia",
  "manejo_objeciones",
  "capacidad_persuasion",
  "uso_cta",
  "duracion",
  "cumplimiento_reglas_marca",
] as const;

export const evaluationSchema = z
  .object({
    scores: z
      .object({
        conocimiento_producto: dimensionScoreSchema,
        claridad_explicacion: dimensionScoreSchema,
        naturalidad_cercania: dimensionScoreSchema,
        uso_responsable_evidencia: dimensionScoreSchema,
        manejo_objeciones: dimensionScoreSchema,
        capacidad_persuasion: dimensionScoreSchema,
        uso_cta: dimensionScoreSchema,
        duracion: dimensionScoreSchema,
        cumplimiento_reglas_marca: dimensionScoreSchema,
      })
      .strict(),
    feedback: z.string().trim().min(1),
    improved_answer: z.string().trim().min(1),
  })
  .strict();

export const copilotCompositionSchema = z
  .object({
    intent: questionIntentSchema,
    express: z.string().trim().min(1),
    estandar: z.string().trim().min(1),
    profunda: z.string().trim().min(1),
    confidence: z.enum(["alto", "medio", "revisar"]),
    cta_used: z.string().trim().min(1).nullable(),
    rule_applied: z.string().trim().min(1).nullable(),
  })
  .strict();

export const copilotIntentSchema = z
  .object({
    intent: questionIntentSchema,
  })
  .strict();

export const transcriptInsightsSchema = z
  .object({
    insights: z.array(
      z
        .object({
          type: z.enum([
            "faq",
            "objecion",
            "error",
            "oportunidad",
            "buena_practica",
            "riesgo_claim",
          ]),
          text: z.string().trim().min(1),
          product_id: z.uuid().nullable(),
          frequency: z.number().int().positive(),
        })
        .strict(),
    ),
    chat_coverage: z
      .array(
        z
          .object({
            question: z.string().trim().min(1),
            answered: z.boolean(),
            evidence_quote: z.string().trim().min(1).nullable(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export type GeneratedQuestions = z.infer<typeof generatedQuestionsSchema>;
export type Evaluation = z.infer<typeof evaluationSchema>;
export type CopilotComposition = z.infer<typeof copilotCompositionSchema>;
export type CopilotIntent = z.infer<typeof copilotIntentSchema>;
export type TranscriptInsights = z.infer<typeof transcriptInsightsSchema>;
