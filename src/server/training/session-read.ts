/**
 * La lectura de una practica, con el dueño como PARAMETRO.
 *
 * Vive aparte de `questions.ts` por dos razones. La primera es que ese archivo
 * paso de 500 lineas y el limite del proyecto son 300. La segunda es la que
 * importa: la misma practica la abre su dueña y la abre quien la acompaña, y
 * duplicar esta derivacion abriria la puerta a que el resumen de supervision
 * muestre una tanda distinta de la que se respondio —el barajado sale del id
 * de la sesion y el tope de `practice_size`, y dos copias divergen—.
 *
 * NO autoriza nada: recibe el id del dueño ya decidido por quien la llama, y
 * la consulta lo exige en el WHERE. Un id equivocado devuelve NOT_FOUND, no la
 * practica de otra persona.
 */

import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";

import type { db } from "../../db/client.ts";
import { products, trainingAnswers, trainingQuestions, trainingSessions } from "../../db/schema.ts";

/** El subconjunto del cliente que esta lectura necesita: solo `select`. */
export type SessionReader = Pick<typeof db, "select">;

/** Tope de preguntas cuando la practica no fija su propio tamaño. */
export const PRACTICE_QUESTION_LIMIT = 10;

export async function readSessionForOwner(
  database: SessionReader,
  sessionId: string,
  ownerId: string,
) {
  try {
    const [session] = await database
      .select({
        id: trainingSessions.id,
        productId: trainingSessions.productId,
        category: trainingSessions.category,
        practiceSize: trainingSessions.practiceSize,
        productName: products.name,
        startedAt: trainingSessions.startedAt,
        finishedAt: trainingSessions.finishedAt,
        activeSeconds: trainingSessions.activeSeconds,
      })
      .from(trainingSessions)
      // leftJoin y no innerJoin: una practica por categoria no tiene ficha.
      .leftJoin(products, eq(products.id, trainingSessions.productId))
      .where(and(eq(trainingSessions.id, sessionId), eq(trainingSessions.advisorId, ownerId)))
      .limit(1);
    if (!session) {
      return { ok: false as const, error: { code: "NOT_FOUND", message: "La sesion no existe." } };
    }
    const scope = session.category
      ? and(eq(products.category, session.category), isNotNull(products.verifiedAt))
      : eq(trainingQuestions.productId, session.productId ?? "");
    // El barajado sale del id de la sesion: aleatorio para la asesora y estable
    // entre recargas, que es lo que necesita retomar una practica a medias. Con
    // random() cada recarga correria la tanda y la primera pendiente cambiaria.
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
    // El tope lo pone la asesora, no el alcance: una practica de una sola ficha
    // con veinte preguntas es igual de valida que una de categoria.
    const questions = session.practiceSize
      ? await query.limit(session.practiceSize)
      : await query.limit(PRACTICE_QUESTION_LIMIT);
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
