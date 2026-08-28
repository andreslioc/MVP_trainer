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
          at_seconds: z.number().int().nonnegative().nullable(),
        })
        .strict(),
    ),
  })
  .strict();

/**
 * Cobertura de chat, un lote a la vez.
 *
 * `i` es el indice del mensaje en la lista que se le entrego al modelo, no un
 * id de base. El modelo nunca reescribe el texto de la pregunta: lo referencia.
 * Asi la fila que se guarda conserva el texto que entro —ya redactado— y no una
 * parafrasis que pudo reintroducir un identificador.
 */
export const chatCoverageBatchSchema = z
  .object({
    items: z.array(
      z
        .object({
          i: z.number().int().nonnegative(),
          es_pregunta: z.boolean(),
          answered: z.boolean(),
          evidence_quote: z.string().trim().min(1).nullable(),
          at_seconds: z.number().int().nonnegative().nullable(),
        })
        .strict(),
    ),
  })
  .strict();

/**
 * Ficha investigada con busqueda web.
 *
 * No trae precio ni categoria a proposito: el precio es una decision comercial
 * de la tienda y la categoria organiza el Training. Que el modelo los proponga
 * seria darle voz sobre cosas que no estan en ninguna etiqueta.
 *
 * Tampoco trae fuentes: esas se toman de la metadata de busqueda del proveedor,
 * no del texto del modelo, que puede escribir una URL que no existe.
 */
export const researchedProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    brand: z.string().trim().min(1).max(120),
    presentation: z.string().trim().min(1).max(200),
    format: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(700),
    /** PARA QUE SIRVE: uso principal y secundarios. Distinto de QUE ES. */
    purpose: z.string().trim().min(1).max(600),
    /** PARA QUIEN ES, solo lo oficialmente respaldado. */
    audience: z.string().trim().max(400),
    subcategory: z.string().trim().max(80),
    /**
     * Como la busca una clienta, separadas por comas.
     *
     * Texto y no arreglo por una razon del proveedor, no de diseño: el esquema
     * de respuesta tiene un techo y este contrato lo estaba tocando —el REST
     * contestaba 400 INVALID_ARGUMENT y ninguna ficha se escribia—. Una lista de
     * palabras es lo que menos pierde al viajar como texto, y se parte en el
     * patch. Antes de agregar otro arreglo aqui, medir contra ese techo.
     */
    keywords: z.string().trim().max(600),
    /** En que se diferencia de las otras referencias de la tienda. */
    vs_similares: z
      .array(
        z
          .object({
            reference: z.string().trim().min(1).max(200),
            difference: z.string().trim().min(1).max(400),
          })
          .strict(),
      )
      .max(5),
    /** Texto y no numero: "0,15 ml (4 gotas)" y "no declarado" caben igual. */
    serving_size: z.string().trim().max(120).nullable(),
    servings_per_container: z.string().trim().max(60).nullable(),
    allergens: z.string().trim().max(300).nullable(),
    active_ingredients: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(160),
            /** Texto y no numero: "200 mg" y "no declarado" caben en el mismo campo. */
            declared_amount: z.string().trim().max(80).nullable(),
          })
          .strict(),
      )
      .max(40),
    benefits: z
      .array(
        z
          .object({
            claim: z.string().trim().min(1).max(200),
            science_note: z.string().trim().min(1).max(400),
          })
          .strict(),
      )
      .min(1)
      .max(3),
    faqs: z
      .array(
        z
          .object({
            question: z.string().trim().min(1).max(200),
            answer: z.string().trim().min(1).max(600),
          })
          .strict(),
      )
      .max(12),
    objections: z
      .array(
        z
          .object({
            objection: z.string().trim().min(1).max(200),
            response: z.string().trim().min(1).max(600),
          })
          .strict(),
      )
      .max(8),
    differentiators: z
      .array(
        z
          .object({
            claim: z.string().trim().min(1).max(200),
            evidence: z.string().trim().min(1).max(400),
          })
          .strict(),
      )
      .max(6),
    usage_mode: z.string().trim().max(400),
    contraindications: z.array(z.string().trim().min(1).max(160)).max(12),
    precautions: z.string().trim().min(1).max(1_500),
    claims_allowed: z.array(z.string().trim().min(1).max(300)).max(12),
    claims_caution: z.array(z.string().trim().min(1).max(300)).max(20),
    unconfirmed: z.array(z.string().trim().min(1).max(300)).max(20),
  })
  .strict();

/**
 * Salida de la capa de seguridad. No reescribe la ficha: la clasifica.
 *
 * `strict()` como el resto de los contratos: una llave extra es una invencion
 * del modelo, no un extra util.
 */
export const safetyLayerSchema = z
  .object({
    live_ready: z.array(z.string().trim().min(1).max(220)).min(3).max(8),
    caution_guidance: z
      .array(
        z
          .object({
            claim: z.string().trim().min(1).max(200),
            reason: z.string().trim().min(1).max(300),
            safe_form: z.string().trim().min(1).max(300),
          })
          .strict(),
      )
      .max(8),
    avoid_guidance: z
      .array(
        z
          .object({
            avoid: z.string().trim().min(1).max(200),
            reason: z.string().trim().min(1).max(200),
            alternative: z.string().trim().max(300),
          })
          .strict(),
      )
      .max(10),
    sensitive_terms: z.array(z.string().trim().min(1).max(40)).max(30),
    advisor_summary: z.string().trim().min(1).max(900),
  })
  .strict();

/**
 * Resultado de investigar UN hueco de la ficha.
 *
 * Plano y con pocos campos a proposito: el contrato de la investigacion
 * completa ya toca el techo del proveedor, y este se pide en una llamada
 * aparte justamente para no competir con aquel.
 */
export const gapVerificationSchema = z
  .object({
    outcome: z.enum(["confirmado", "no_publicado", "contradictorio"]),
    finding: z.string().trim().min(1).max(900),
    searched_in: z.array(z.string().trim().min(1).max(160)).max(10),
    sources: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(200),
            url: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();

export type GapVerification = z.infer<typeof gapVerificationSchema>;
export type SafetyLayer = z.infer<typeof safetyLayerSchema>;
export type ResearchedProduct = z.infer<typeof researchedProductSchema>;
export type GeneratedQuestions = z.infer<typeof generatedQuestionsSchema>;
export type Evaluation = z.infer<typeof evaluationSchema>;
export type CopilotComposition = z.infer<typeof copilotCompositionSchema>;
export type CopilotIntent = z.infer<typeof copilotIntentSchema>;
export type TranscriptInsights = z.infer<typeof transcriptInsightsSchema>;
export type ChatCoverageBatch = z.infer<typeof chatCoverageBatchSchema>;
