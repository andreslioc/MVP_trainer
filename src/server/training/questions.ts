import { and, asc, count, desc, eq, isNotNull, sql } from "drizzle-orm";
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
import { buildGenerateQuestionsPrompt } from "../../lib/ai/prompts/generate-questions.ts";
import { type GeneratedQuestions, generatedQuestionsSchema } from "../../lib/ai/schemas.ts";
import {
  generateStructured,
  type StructuredOutputInput,
  type StructuredOutputResult,
} from "../../lib/ai/structured.ts";
import { type AdvisorRole, requireRole } from "../../lib/auth.ts";
import { writeLlmCall } from "../llm-calls.ts";

type Product = typeof products.$inferSelect;
type TrainingDatabase = Pick<typeof db, "insert" | "select" | "transaction">;
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };
type Authorize = (role: AdvisorRole) => Promise<AuthorizationResult>;
type Generate = (
  input: StructuredOutputInput<GeneratedQuestions>,
) => Promise<StructuredOutputResult<GeneratedQuestions>>;

export type TrainingDependencies = {
  authorize?: Authorize;
  database?: TrainingDatabase;
  generate?: Generate;
};

const aiGateway = createAiGateway({ writeCall: writeLlmCall });

async function defaultGenerate(input: Parameters<Generate>[0]) {
  return generateStructured(input, aiGateway);
}

export function trainingDependencies(options: TrainingDependencies) {
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
      error: { code: "VALIDATION", message: "El identificador no es valido.", field },
    };
  }
  return { ok: true as const, data: parsed.data };
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ignoredWords = new Set([
  "para",
  "como",
  "este",
  "esta",
  "producto",
  "puede",
  "debe",
  "solo",
  "sobre",
  "entre",
  "desde",
  "tiene",
  "usar",
  "cliente",
]);

function knowledgeTokens(product: Product) {
  const knowledge = [
    product.name,
    product.brand,
    product.category,
    product.presentation,
    product.format,
    product.description,
    product.precautions,
    ...product.activeIngredients.map((item) => `${item.name} ${item.unit ?? ""}`),
    ...product.benefits.flatMap((item) => [item.claim, item.science_note]),
    ...product.faqs.flatMap((item) => [item.question, item.answer]),
    ...product.objections.flatMap((item) => [item.objection, item.response]),
    ...product.differentiators.flatMap((item) => [item.claim, item.evidence]),
    ...product.claimsAllowed,
    ...product.claimsCaution,
  ];
  return new Set(
    normalize(knowledge.join(" "))
      .split(" ")
      .filter((word) => word.length >= 5 && !ignoredWords.has(word)),
  );
}

/**
 * Una negacion en la oracion: la asesora TIENE que poder decir "no cura
 * enfermedades", y esa frase contiene la prohibida.
 */
const negation = /\b(no|ni|nunca|jamas|ningun|ninguna|ninguno|tampoco|sin)\b/;

/**
 * Afirma el reclamo prohibido, en vez de negarlo.
 *
 * Se mira oracion por oracion y solo cuenta la negacion que llega ANTES de la
 * frase: "no reemplaza una dieta. Cura la diabetes." son dos oraciones y la
 * segunda se marca igual. Queda un hueco conocido — "no tiene efectos, cura la
 * diabetes", negacion y afirmacion en la misma oracion — que ninguna heuristica
 * de subcadena cierra; para eso esta la revision humana de la ficha.
 */
function assertsForbiddenClaim(answer: string, forbidden: string[]) {
  return answer
    .split(/[.;!?\n]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .some((sentence) =>
      forbidden.some((claim) => {
        const at = sentence.indexOf(claim);
        if (at === -1) return false;
        return !negation.test(sentence.slice(0, at));
      }),
    );
}

function isCautiousAnswer(answer: string) {
  const normalized = normalize(answer);
  return [
    "no esta verificado",
    "no se encuentra verificado",
    "consulta a un profesional",
    "consulta con un profesional",
    "revisa la etiqueta",
  ].some((phrase) => normalized.includes(phrase));
}

export function validateGeneratedQuestionBatch(value: unknown, product: Product) {
  const parsed = generatedQuestionsSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { code: "INVALID_GENERATED_QUESTIONS", message: "La tanda no cumple el esquema." },
    };
  }

  const difficultyCounts = new Map<string, number>();
  const intents = new Set<string>();
  for (const question of parsed.data.questions) {
    difficultyCounts.set(question.difficulty, (difficultyCounts.get(question.difficulty) ?? 0) + 1);
    intents.add(question.intent);
  }
  if (
    difficultyCounts.get("basica") !== 2 ||
    difficultyCounts.get("intermedia") !== 2 ||
    difficultyCounts.get("dificil") !== 2 ||
    intents.size < 4
  ) {
    return {
      ok: false as const,
      error: {
        code: "INVALID_GENERATED_QUESTIONS",
        message: "La tanda no esta balanceada por dificultad e intencion.",
      },
    };
  }

  const allowedTokens = knowledgeTokens(product);
  const forbidden = product.claimsForbidden.map(normalize).filter(Boolean);
  for (const [index, question] of parsed.data.questions.entries()) {
    const answer = normalize(question.ideal_answer);
    // El numero de la pregunta va en el mensaje: sin el, rechazar la tanda
    // obliga a instrumentar el pipeline para saber cual de las seis fallo.
    const position = index + 1;
    if (
      assertsForbiddenClaim(answer, forbidden) ||
      /^(este producto )?(cura|trata|previene|elimina|garantiza)\b/.test(answer)
    ) {
      return {
        ok: false as const,
        error: {
          code: "INVALID_GENERATED_QUESTIONS",
          message: `La respuesta ideal de la pregunta ${position} afirma un reclamo prohibido: "${question.text}".`,
        },
      };
    }
    if (isCautiousAnswer(answer)) continue;
    const supported = answer
      .split(" ")
      .some((word) => word.length >= 5 && !ignoredWords.has(word) && allowedTokens.has(word));
    if (!supported) {
      return {
        ok: false as const,
        error: {
          code: "INVALID_GENERATED_QUESTIONS",
          message: `La respuesta ideal de la pregunta ${position} no se apoya en la ficha: "${question.text}".`,
        },
      };
    }
  }

  return { ok: true as const, data: parsed.data };
}

export async function listTrainingProducts(options: TrainingDependencies = {}) {
  const { authorize, database } = trainingDependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;

  try {
    const rows = await database
      .select({
        id: products.id,
        name: products.name,
        brand: products.brand,
        questionCount: count(trainingQuestions.id),
      })
      .from(products)
      .leftJoin(trainingQuestions, eq(trainingQuestions.productId, products.id))
      .where(isNotNull(products.verifiedAt))
      .groupBy(products.id, products.name, products.brand)
      .orderBy(asc(products.name));
    return { ok: true as const, data: rows };
  } catch {
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudieron cargar los productos de practica." },
    };
  }
}

/**
 * Cuantas preguntas se ponen en una practica por categoria.
 *
 * El chat de un live no da para mas de una decena de preguntas seguidas, y una
 * practica que no se puede terminar no se termina.
 */
const PRACTICE_QUESTION_LIMIT = 10;

export async function generateTrainingQuestions(
  productId: string,
  options: TrainingDependencies = {},
) {
  const { authorize, database, generate } = trainingDependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;
  const parsedId = parseUuid(productId, "productId");
  if (!parsedId.ok) return parsedId;

  try {
    const [product] = await database
      .select()
      .from(products)
      .where(eq(products.id, parsedId.data))
      .limit(1);
    if (!product) {
      return {
        ok: false as const,
        error: { code: "NOT_FOUND", message: "El producto no existe." },
      };
    }
    if (!product.verifiedAt) {
      return {
        ok: false as const,
        error: { code: "CONFLICT", message: "Verifica la ficha antes de generar preguntas." },
      };
    }

    const [prompt] = await database
      .select({ id: prompts.id })
      .from(prompts)
      .where(and(eq(prompts.name, "generate_questions"), eq(prompts.active, true)))
      .orderBy(desc(prompts.version))
      .limit(1);
    if (!prompt) {
      return {
        ok: false as const,
        error: { code: "INTERNAL", message: "No existe un prompt activo para generar preguntas." },
      };
    }

    const rendered = buildGenerateQuestionsPrompt(product);
    const generated = await generate({
      advisorId: authorization.data.id,
      purpose: "generate_questions",
      promptId: prompt.id,
      schema: generatedQuestionsSchema,
      system: rendered.system,
      messages: rendered.messages,
      maxTokens: 4_000,
      effort: "high",
    });
    if (!generated.ok) return generated;

    const batch = validateGeneratedQuestionBatch(generated.data.value, product);
    if (!batch.ok) return batch;

    const inserted = await database.transaction(async (tx) =>
      tx
        .insert(trainingQuestions)
        .values(
          batch.data.questions.map((question) => ({
            productId: product.id,
            text: question.text,
            intent: question.intent,
            difficulty: question.difficulty,
            idealAnswer: question.ideal_answer,
            criteria: question.criteria,
            source: "generated" as const,
          })),
        )
        .returning(),
    );
    return { ok: true as const, data: inserted };
  } catch {
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudo guardar la tanda de preguntas." },
    };
  }
}

export async function startTrainingSession(productId: string, options: TrainingDependencies = {}) {
  const { authorize, database } = trainingDependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;
  const parsedId = parseUuid(productId, "productId");
  if (!parsedId.ok) return parsedId;

  try {
    return await database.transaction(async (tx) => {
      const [product] = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, parsedId.data), isNotNull(products.verifiedAt)))
        .limit(1);
      if (!product) {
        return {
          ok: false as const,
          error: { code: "NOT_FOUND", message: "No hay una ficha verificada para practicar." },
        };
      }
      const [question] = await tx
        .select({ id: trainingQuestions.id })
        .from(trainingQuestions)
        .where(eq(trainingQuestions.productId, product.id))
        .limit(1);
      if (!question) {
        return {
          ok: false as const,
          error: { code: "CONFLICT", message: "Genera preguntas antes de iniciar la practica." },
        };
      }
      const [session] = await tx
        .insert(trainingSessions)
        .values({ advisorId: authorization.data.id, productId: product.id })
        .returning();
      if (!session) throw new Error("No se creo la sesion.");
      return { ok: true as const, data: session };
    });
  } catch {
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudo iniciar la practica." },
    };
  }
}

export async function getTrainingSession(sessionId: string, options: TrainingDependencies = {}) {
  const { authorize, database } = trainingDependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;
  const parsedId = parseUuid(sessionId, "sessionId");
  if (!parsedId.ok) return parsedId;

  try {
    const [session] = await database
      .select({
        id: trainingSessions.id,
        productId: trainingSessions.productId,
        category: trainingSessions.category,
        productName: products.name,
        startedAt: trainingSessions.startedAt,
      })
      .from(trainingSessions)
      // leftJoin y no innerJoin: una practica por categoria no tiene ficha.
      .leftJoin(products, eq(products.id, trainingSessions.productId))
      .where(
        and(
          eq(trainingSessions.id, parsedId.data),
          eq(trainingSessions.advisorId, authorization.data.id),
        ),
      )
      .limit(1);
    if (!session) {
      return { ok: false as const, error: { code: "NOT_FOUND", message: "La sesion no existe." } };
    }
    const scope = session.category
      ? and(eq(products.category, session.category), isNotNull(products.verifiedAt))
      : eq(trainingQuestions.productId, session.productId ?? "");
    // El barajado sale del id de la sesion: aleatorio para la asesora y estable
    // entre recargas, que es lo que necesita el `?q=` de la URL. Con random()
    // cada recarga mostraria otra pregunta en la misma posicion.
    const order = session.category
      ? sql`md5(${session.id} || ${trainingQuestions.id}::text)`
      : asc(trainingQuestions.createdAt);
    const query = database
      .select({
        id: trainingQuestions.id,
        text: trainingQuestions.text,
        intent: trainingQuestions.intent,
        difficulty: trainingQuestions.difficulty,
        productName: products.name,
      })
      .from(trainingQuestions)
      .innerJoin(products, eq(products.id, trainingQuestions.productId))
      .where(scope)
      .orderBy(order);
    const questions = session.category ? await query.limit(PRACTICE_QUESTION_LIMIT) : await query;
    const answers = await database
      .select({
        id: trainingAnswers.id,
        questionId: trainingAnswers.questionId,
        advisorAnswer: trainingAnswers.advisorAnswer,
        scores: trainingAnswers.scores,
        feedback: trainingAnswers.feedback,
        improvedAnswer: trainingAnswers.improvedAnswer,
        createdAt: trainingAnswers.createdAt,
      })
      .from(trainingAnswers)
      .where(eq(trainingAnswers.sessionId, session.id))
      .orderBy(desc(trainingAnswers.createdAt));
    return {
      ok: true as const,
      // `title` es lo que se muestra como encabezado: la categoria cuando la
      // practica mezcla fichas, el nombre de la ficha cuando es dirigida.
      data: {
        ...session,
        title: session.category ?? session.productName ?? "Practica",
        questions,
        answers,
      },
    };
  } catch {
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudo cargar la sesion." },
    };
  }
}
