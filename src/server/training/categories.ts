import { and, asc, count, countDistinct, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { products, trainingQuestions, trainingSessions } from "../../db/schema.ts";
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
 * Genera una tanda para la categoria, sobre la ficha que menos preguntas tiene.
 *
 * Es una sola llamada al modelo por clic, igual que la version por producto: 89
 * fichas por 3 preguntas cada una en un clic seria una factura sorpresa. La
 * ficha con menos preguntas es la que hace crecer la variedad de la categoria.
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
    const [target] = await database
      .select({ id: products.id, questionCount: count(trainingQuestions.id) })
      .from(products)
      .leftJoin(trainingQuestions, eq(trainingQuestions.productId, products.id))
      .where(and(isNotNull(products.verifiedAt), eq(products.category, parsedCategory.data)))
      .groupBy(products.id)
      .orderBy(asc(count(trainingQuestions.id)), asc(products.name))
      .limit(1);
    if (!target) {
      return {
        ok: false as const,
        error: {
          code: "NOT_FOUND",
          message: "Esta categoria no tiene fichas verificadas todavia.",
        },
      };
    }
    return await generateTrainingQuestions(target.id, options);
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
  options: TrainingDependencies = {},
) {
  const { authorize, database } = trainingDependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;
  const parsedCategory = parseCategory(category);
  if (!parsedCategory.ok) return parsedCategory;

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
        .values({ advisorId: authorization.data.id, category: parsedCategory.data })
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
