import { and, asc, count, countDistinct, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { products, trainingAnswers, trainingQuestions, trainingSessions } from "../../db/schema.ts";
import { practiceSizeSchema } from "../../lib/practice-sizes.ts";
import {
  generateTrainingQuestions,
  type TrainingDependencies,
  trainingDependencies,
} from "./questions.ts";

const categorySchema = z.string().trim().min(1).max(120);

function parseCategory(value: string) {
  const parsed = categorySchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { code: "VALIDATION", message: "Elige una categoria valida.", field: "category" },
    };
  }
  return { ok: true as const, data: parsed.data };
}

export async function listTrainingCategories(options: TrainingDependencies = {}) {
  const { authorize, database } = trainingDependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;

  try {
    const rows = await database
      .select({
        category: products.category,
        productCount: countDistinct(products.id),
        questionCount: count(trainingQuestions.id),
      })
      .from(products)
      .leftJoin(trainingQuestions, eq(trainingQuestions.productId, products.id))
      .where(isNotNull(products.verifiedAt))
      .groupBy(products.category)
      .orderBy(asc(products.category));
    return { ok: true as const, data: rows };
  } catch {
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudieron cargar las categorias de practica." },
    };
  }
}

/**
 * Cuantas fichas distintas cubre un clic de "Generar preguntas".
 *
 * Con una sola ficha por clic la practica no tiene azar: las seis preguntas
 * salen del mismo producto y la asesora responde en piloto automatico. Con tres
 * ya hay mezcla desde el primer clic. No son las 64 de la categoria porque cada
 * ficha es una llamada al modelo, y 64 llamadas por clic es una factura
 * sorpresa.
 */
const FICHAS_POR_TANDA = 3;

/**
 * Genera una tanda nueva para la categoria y REEMPLAZA la anterior.
 *
 * No se acumula: la asesora quiere practicar preguntas distintas, no una bolsa
 * que crece hasta que las mismas seis del principio ya se saben de memoria. Las
 * fichas se sortean, asi que dos tandas seguidas casi nunca caen en las mismas.
 *
 * Lo unico que sobrevive al reemplazo son las preguntas ya respondidas y las de
 * origen `seed`: las primeras son historia de practica que el panel usa, y las
 * segundas las escribio una persona en un archivo de investigacion. Borrarlas
 * seria perder trabajo humano por un clic.
 *
 * Cada ficha se valida por separado: si el modelo se sale del Hub en una, esa
 * se descarta y las demas se guardan. Una sola frase mala no debe costar las
 * tres tandas.
 */
export async function generateCategoryTrainingQuestions(
  category: string,
  options: TrainingDependencies = {},
) {
  const { authorize, database } = trainingDependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;
  const parsedCategory = parseCategory(category);
  if (!parsedCategory.ok) return parsedCategory;

  try {
    const targets = await database
      .select({ id: products.id })
      .from(products)
      .where(and(isNotNull(products.verifiedAt), eq(products.category, parsedCategory.data)))
      // Al azar y no por nombre: si la tanda reemplaza a la anterior, ordenar
      // por nombre devolveria siempre las mismas tres fichas de la categoria.
      .orderBy(sql`random()`)
      .limit(FICHAS_POR_TANDA);
    if (targets.length === 0) {
      return {
        ok: false as const,
        error: {
          code: "NOT_FOUND",
          message: "Esta categoria no tiene fichas verificadas todavia.",
        },
      };
    }

    // En paralelo: el gateway ya limita la concurrencia con AI_MAX_CONCURRENCY,
    // y en serie la asesora esperaria el triple frente a la pantalla.
    const batches = await Promise.all(
      targets.map((target) => generateTrainingQuestions(target.id, options)),
    );
    const questions = batches.flatMap((batch) => (batch.ok ? batch.data : []));
    if (questions.length === 0) {
      const failed = batches.find((batch) => !batch.ok);
      if (failed && !failed.ok) return failed;
      return {
        ok: false as const,
        error: { code: "INTERNAL", message: "No se genero ninguna pregunta." },
      };
    }
    // El reemplazo va DESPUES de generar: si se borrara primero y el modelo
    // fallara, la asesora se quedaria sin ninguna pregunta que practicar.
    const fresh = new Set(questions.map((question) => question.id));
    const previous = await database
      .select({ id: trainingQuestions.id })
      .from(trainingQuestions)
      .innerJoin(products, eq(products.id, trainingQuestions.productId))
      .leftJoin(trainingAnswers, eq(trainingAnswers.questionId, trainingQuestions.id))
      .where(
        and(
          eq(products.category, parsedCategory.data),
          eq(trainingQuestions.source, "generated"),
          isNull(trainingAnswers.id),
        ),
      );
    const stale = previous.map((row) => row.id).filter((id) => !fresh.has(id));
    if (stale.length > 0) {
      await database.delete(trainingQuestions).where(inArray(trainingQuestions.id, stale));
    }
    return { ok: true as const, data: questions, replaced: stale.length };
  } catch {
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudo elegir una ficha de la categoria." },
    };
  }
}

/**
 * Abre una practica de categoria: las preguntas salen de varias fichas.
 *
 * La sesion guarda la categoria, no la lista de preguntas: el orden se deriva
 * del id de la sesion (ver getTrainingSession), asi que es el mismo en cada
 * recarga sin necesidad de una tabla puente.
 */
export async function startCategoryTrainingSession(
  category: string,
  practiceSize: number,
  options: TrainingDependencies = {},
) {
  const { authorize, database } = trainingDependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;
  const parsedCategory = parseCategory(category);
  if (!parsedCategory.ok) return parsedCategory;
  const parsedSize = practiceSizeSchema.safeParse(practiceSize);
  if (!parsedSize.success) {
    return {
      ok: false as const,
      error: {
        code: "VALIDATION",
        message: "Elige un tamano de practica de la lista.",
        field: "practiceSize",
      },
    };
  }

  try {
    return await database.transaction(async (tx) => {
      const [available] = await tx
        .select({ questionCount: count(trainingQuestions.id) })
        .from(trainingQuestions)
        .innerJoin(products, eq(products.id, trainingQuestions.productId))
        .where(and(isNotNull(products.verifiedAt), eq(products.category, parsedCategory.data)));
      if (!available || available.questionCount === 0) {
        return {
          ok: false as const,
          error: {
            code: "CONFLICT",
            message: "Genera preguntas de esta categoria antes de iniciar la practica.",
          },
        };
      }
      const [session] = await tx
        .insert(trainingSessions)
        .values({
          advisorId: authorization.data.id,
          category: parsedCategory.data,
          practiceSize: parsedSize.data,
        })
        .returning();
      if (!session) throw new Error("No se creo la sesion.");
      return { ok: true as const, data: session };
    });
  } catch {
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudo abrir la practica de la categoria." },
    };
  }
}
