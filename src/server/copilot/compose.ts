import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../db/client.ts";
import {
  commercialRules,
  copilotExchanges,
  liveSessions,
  products,
  prompts,
} from "../../db/schema.ts";
import {
  createAiGateway,
  type GenerateStructuredStreamInput,
  type StructuredStreamResult,
} from "../../lib/ai/gateway.ts";
import {
  buildCopilotClassifyPrompt,
  buildCopilotComposePrompt,
} from "../../lib/ai/prompts/copilot.ts";
import { productKnowledgeForPrompt } from "../../lib/ai/prompts/generate-questions.ts";
import {
  type CopilotComposition,
  copilotCompositionSchema,
  type CopilotIntent,
  copilotIntentSchema,
} from "../../lib/ai/schemas.ts";
import {
  generateStructured,
  type StructuredOutputInput,
  type StructuredOutputResult,
} from "../../lib/ai/structured.ts";
import { type AdvisorRole, requireRole } from "../../lib/auth.ts";
import { writeLlmCall } from "../llm-calls.ts";
import { availableCtasFromRules, orchestrateCopilot } from "./orchestrator.ts";
import { promoPercentFor } from "./session.ts";
import { applyResponsibleCommunication, type ResponsibleAlert } from "./responsible.ts";

const composeInputSchema = z
  .object({
    liveSessionId: z.uuid(),
    productId: z.uuid(),
    customerQuestion: z.string().trim().min(1).max(2_000),
    lengthVariant: z.enum(["express", "estandar", "profunda"]),
    objective: z.string().trim().min(1).max(100),
    tone: z.string().trim().min(1).max(100),
  })
  .strict();

type CopilotDatabase = Pick<typeof db, "select" | "transaction">;
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };
type Classify = (
  input: StructuredOutputInput<CopilotIntent>,
) => Promise<StructuredOutputResult<CopilotIntent>>;
type StreamComposition = (
  input: GenerateStructuredStreamInput<CopilotComposition>,
) => Promise<StructuredStreamResult<CopilotComposition>>;

export type ComposeDependencies = {
  authorize?: (role: AdvisorRole) => Promise<AuthorizationResult>;
  database?: CopilotDatabase;
  classify?: Classify;
  stream?: StreamComposition;
  now?: () => number;
  onChunk?: (chunk: string) => void | Promise<void>;
};

const aiGateway = createAiGateway({ writeCall: writeLlmCall });

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

export function estimateDurationSeconds(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 2.5));
}

export function safeCopilotFallback(intent: CopilotIntent["intent"]): CopilotComposition {
  const answer =
    "Ese dato no está verificado en nuestra ficha. Para darte una respuesta responsable, revisemos la etiqueta o consultemos con un profesional antes de afirmarlo.";
  return {
    intent,
    express: answer,
    estandar: answer,
    profunda: answer,
    confidence: "revisar",
    cta_used: null,
    rule_applied: null,
  };
}

/**
 * Como pregunta por precio una clienta en un live.
 *
 * El patron viejo era `precio|cuanto cuesta|cuanto vale`, y medido contra 250
 * preguntas reales dejaba pasar 34 de las 108 de precio: "a como", "que vale",
 * "q cuesta", "que costo tiene", "a cuanto", "presio". Las que se colaban
 * llegaban al modelo sin dato y sin nada que las validara.
 *
 * La raiz va suelta —`preci\w*`— porque en un chat de live se escribe rapido y
 * mal: "preciob", "precioo", "preciooo" aparecen tal cual en el live medido.
 */
const PRICE_QUESTION =
  /\b(preci\w*|presi\w*|valor|cuesta|costo|cuanto vale|que vale|a como|a cuanto)\b|\bcuanto\b/;

export function asksForMissingSensitiveFact(
  question: string,
  product: typeof products.$inferSelect,
) {
  const normalizedQuestion = normalize(question);
  // SKU e imagen son metadatos internos: tampoco deben influir en los gates
  // que deciden que conocimiento puede llegar a una respuesta.
  const knowledge = normalize(JSON.stringify(productKnowledgeForPrompt(product)));
  // Solo se corta si NO hay precio cargado. Con precio en la ficha el modelo
  // ya no tiene que inventarlo: se lo entregamos calculado.
  if (product.priceCop === null && PRICE_QUESTION.test(normalizedQuestion)) return true;
  return ["fda", "certificacion", "estudio", "porcentaje", "dosis"]
    .filter((term) => normalizedQuestion.includes(term))
    .some((term) => !knowledge.includes(term));
}

function validateComposition(
  value: unknown,
  expectedIntent: CopilotIntent["intent"],
  orchestration: ReturnType<typeof orchestrateCopilot>,
) {
  const parsed = copilotCompositionSchema.safeParse(value);
  if (!parsed.success) return null;
  if (parsed.data.intent !== expectedIntent) return null;
  if (parsed.data.cta_used !== (orchestration.cta?.text ?? null)) return null;
  if (parsed.data.rule_applied !== orchestration.ruleApplied) return null;
  return parsed.data;
}

/**
 * Convierte un fallo del gateway en lo que la asesora debe leer.
 *
 * Una cuota agotada no se arregla reintentando, y decirle "intenta de nuevo" a
 * alguien que esta en camara le hace perder el live pulsando un boton muerto.
 * El unico caso en que "reintenta" es un consejo honesto es cuando el error es
 * efectivamente transitorio.
 */
function copilotFailure(error: { code: string; retryable?: boolean }) {
  if (error.code === "AI_QUOTA_EXCEEDED") {
    return {
      ok: false as const,
      error: {
        code: "COPILOT_QUOTA_EXCEEDED",
        message:
          "Se agoto la cuota diaria de IA. Reintentar no sirve: responde con tus propias palabras y avisa a una administradora.",
      },
    };
  }
  return {
    ok: false as const,
    error: {
      code: "COPILOT_FAILED",
      message:
        error.retryable === false
          ? "No se pudo generar y reintentar no va a ayudar. Responde con tus propias palabras."
          : "No se pudo generar. Intenta de nuevo. Tu pregunta sigue en el formulario.",
    },
  };
}

export async function composeCopilotAnswer(input: unknown, options: ComposeDependencies = {}) {
  const authorization = await (options.authorize ?? requireRole)("asesor");
  if (!authorization.ok) return authorization;
  const parsedInput = composeInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false as const,
      error: { code: "VALIDATION", message: "Revisa la pregunta y las opciones del Copilot." },
    };
  }

  const database = options.database ?? db;
  const classify =
    options.classify ??
    ((request: Parameters<Classify>[0]) => generateStructured(request, aiGateway));
  const stream =
    options.stream ??
    ((request: Parameters<StreamComposition>[0]) => aiGateway.generateStructuredStream(request));
  const onChunk = options.onChunk ?? (() => undefined);
  const now = options.now ?? Date.now;
  const startedAt = now();

  try {
    const [[session], [product], activeRules, promptRows] = await Promise.all([
      database
        .select({
          id: liveSessions.id,
          ctasUsed: liveSessions.ctasUsed,
          promosMentioned: liveSessions.promosMentioned,
          productPromos: liveSessions.productPromos,
        })
        .from(liveSessions)
        .where(
          and(
            eq(liveSessions.id, parsedInput.data.liveSessionId),
            eq(liveSessions.advisorId, authorization.data.id),
            isNull(liveSessions.endedAt),
          ),
        )
        .limit(1),
      database.select().from(products).where(eq(products.id, parsedInput.data.productId)).limit(1),
      database
        .select({
          key: commercialRules.key,
          value: commercialRules.value,
          active: commercialRules.active,
        })
        .from(commercialRules)
        .orderBy(asc(commercialRules.key)),
      database
        .select({ id: prompts.id, name: prompts.name })
        .from(prompts)
        .where(eq(prompts.active, true))
        .orderBy(desc(prompts.version)),
    ]);
    if (!session || !product) {
      return { ok: false as const, error: { code: "NOT_FOUND", message: "El live no existe." } };
    }
    const classifyPrompt = promptRows.find((prompt) => prompt.name === "copilot_classify");
    const composePrompt = promptRows.find(
      (prompt) => prompt.name === `copilot_compose_${parsedInput.data.lengthVariant}`,
    );
    if (!classifyPrompt || !composePrompt) {
      return {
        ok: false as const,
        error: { code: "COPILOT_PROMPT_MISSING", message: "El Copilot no esta configurado." },
      };
    }
    const rulesForPrompt = activeRules
      .filter((rule) => rule.active)
      .map(({ key, value }) => ({ key, value }));

    const classifyRendered = buildCopilotClassifyPrompt(parsedInput.data.customerQuestion);
    const classified = await classify({
      advisorId: authorization.data.id,
      purpose: "copilot_classify",
      promptId: classifyPrompt.id,
      schema: copilotIntentSchema,
      system: classifyRendered.system,
      messages: classifyRendered.messages,
      maxTokens: 256,
      effort: "low",
    });
    if (!classified.ok) return copilotFailure(classified.error);

    // La orquestacion va DESPUES de clasificar y no antes: elegir el CTA sin
    // saber que pregunto la clienta es como termino respondiendo "sigue la
    // cuenta" a alguien que pregunto el precio.
    const orchestration = orchestrateCopilot({
      availableCtas: availableCtasFromRules(activeRules),
      rules: activeRules,
      ctasUsed: session.ctasUsed,
      promosMentioned: session.promosMentioned,
      intent: classified.data.value.intent,
    });

    let composition: CopilotComposition;
    let alerts: ResponsibleAlert[] = [];
    let timeToFirstTokenMs: number;
    let appliedOrchestration = orchestration;
    let providerRefusal = false;
    if (asksForMissingSensitiveFact(parsedInput.data.customerQuestion, product)) {
      composition = safeCopilotFallback(classified.data.value.intent);
      appliedOrchestration = { cta: null, incentive: null, ruleApplied: null };
      timeToFirstTokenMs = Math.max(0, now() - startedAt);
    } else {
      const rendered = buildCopilotComposePrompt({
        product,
        // El descuento sale de ESTA sesion de live, no de la ficha.
        promoPercent: promoPercentFor(session.productPromos, product.id),
        activeRules: rulesForPrompt,
        customerQuestion: parsedInput.data.customerQuestion,
        intent: classified.data.value.intent,
        objective: parsedInput.data.objective,
        tone: parsedInput.data.tone,
        orchestration,
      });
      const generated = await stream({
        advisorId: authorization.data.id,
        purpose: "copilot_compose",
        promptId: composePrompt.id,
        schema: copilotCompositionSchema,
        system: rendered.system,
        messages: rendered.messages,
        maxTokens: 64_000,
        effort: "low",
        onDelta: () => undefined,
      });
      if (!generated.ok) {
        if (generated.error.code !== "AI_REFUSAL") return copilotFailure(generated.error);
        composition = safeCopilotFallback(classified.data.value.intent);
        providerRefusal = true;
        appliedOrchestration = { cta: null, incentive: null, ruleApplied: null };
        timeToFirstTokenMs = Math.max(0, now() - startedAt);
      } else {
        const safe = validateComposition(
          generated.data.value,
          classified.data.value.intent,
          orchestration,
        );
        if (!safe) {
          return {
            ok: false as const,
            error: { code: "COPILOT_FAILED", message: "No se pudo generar. Intenta de nuevo." },
          };
        }
        composition = safe;
        timeToFirstTokenMs = generated.data.timeToFirstTokenMs;
      }
    }

    const responsible = applyResponsibleCommunication({
      question: parsedInput.data.customerQuestion,
      promoPercent: promoPercentFor(session.productPromos, product.id),
      composition,
      product,
      refusal: providerRefusal,
    });
    if (!responsible.ok) return responsible;
    composition = responsible.data.composition;
    alerts = responsible.data.alerts;
    if (!composition.cta_used || !composition.rule_applied) {
      appliedOrchestration = { cta: null, incentive: null, ruleApplied: null };
    }

    const answerText = composition[parsedInput.data.lengthVariant];
    await onChunk(answerText);
    const recordedAt = new Date().toISOString();
    const ctaEntries = appliedOrchestration.cta
      ? [{ cta: appliedOrchestration.cta.text, at: recordedAt }]
      : [];
    const promotionEntries = appliedOrchestration.incentive
      ? [{ rule_key: appliedOrchestration.incentive.ruleKey, at: recordedAt }]
      : [];
    const exchange = await database.transaction(async (tx) => {
      const [updatedSession] = await tx
        .update(liveSessions)
        .set({
          ctasUsed: sql`${liveSessions.ctasUsed} || ${JSON.stringify(ctaEntries)}::jsonb`,
          promosMentioned: sql`${liveSessions.promosMentioned} || ${JSON.stringify(promotionEntries)}::jsonb`,
        })
        .where(
          and(
            eq(liveSessions.id, session.id),
            eq(liveSessions.advisorId, authorization.data.id),
            isNull(liveSessions.endedAt),
          ),
        )
        .returning({ id: liveSessions.id });
      if (!updatedSession) throw new Error("La sesion ya no esta activa.");
      const [createdExchange] = await tx
        .insert(copilotExchanges)
        .values({
          liveSessionId: session.id,
          productId: product.id,
          customerQuestion: parsedInput.data.customerQuestion,
          intent: composition.intent,
          answerText,
          lengthVariant: parsedInput.data.lengthVariant,
          durationEstimateS: estimateDurationSeconds(answerText),
          confidence: composition.confidence,
          ctaUsed: composition.cta_used,
          ruleApplied: composition.rule_applied,
          alerts,
        })
        .returning();
      if (!createdExchange) throw new Error("No se guardo el intercambio.");
      return createdExchange;
    });
    return {
      ok: true as const,
      data: {
        exchange,
        composition,
        durations: {
          express: estimateDurationSeconds(composition.express),
          estandar: estimateDurationSeconds(composition.estandar),
          profunda: estimateDurationSeconds(composition.profunda),
        },
        timeToFirstTokenMs,
        time_to_first_token_ms: timeToFirstTokenMs,
      },
    };
  } catch {
    return {
      ok: false as const,
      error: { code: "COPILOT_FAILED", message: "No se pudo generar. Intenta de nuevo." },
    };
  }
}
