/**
 * Estado de una practica: cuales quedaron a medias y como le fue en la que
 * termino.
 *
 * La practica es lineal —una pregunta, la siguiente, y al final el consolidado—
 * asi que salir a mitad de camino tiene que poder retomarse. Sin esta lectura,
 * una sesion abandonada quedaba invisible: la asesora volvia a Training y solo
 * podia abrir otra desde cero.
 */

import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { products, trainingAnswers, trainingSessions } from "../../db/schema.ts";
import { buildPracticeSummary } from "../../lib/training/summary.ts";
import {
  getTrainingSession,
  type TrainingDependencies,
  trainingDependencies,
} from "./questions.ts";

/**
 * Cuantas practicas a medias se ofrecen para retomar.
 *
 * Cada clic en "Comenzar practica" abre una sesion, asi que la lista completa
 * crece sin techo y la pantalla dejaria de decir cual importa. Las tres mas
 * recientes son las que la asesora reconoce.
 */
const OPEN_PRACTICE_LIMIT = 3;

export async function listOpenPractices(options: TrainingDependencies = {}) {
  const { authorize, database } = trainingDependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;

  try {
    const sessions = await database
      .select({
        id: trainingSessions.id,
        category: trainingSessions.category,
        practiceSize: trainingSessions.practiceSize,
        productName: products.name,
        startedAt: trainingSessions.startedAt,
        activeSeconds: trainingSessions.activeSeconds,
      })
      .from(trainingSessions)
      // leftJoin: una practica por categoria no apunta a ninguna ficha.
      .leftJoin(products, eq(products.id, trainingSessions.productId))
      .where(
        and(
          eq(trainingSessions.advisorId, authorization.data.id),
          isNull(trainingSessions.finishedAt),
        ),
      )
      .orderBy(desc(trainingSessions.startedAt))
      .limit(OPEN_PRACTICE_LIMIT);
    if (sessions.length === 0) return { ok: true as const, data: [] };

    // Consulta agrupada aparte y no una subconsulta correlacionada en la lista
    // de seleccion: ahi las columnas interpoladas salen sin calificar y la
    // condicion se ata a la columna equivocada (ver finishPracticeIfComplete).
    const counted = await database
      .select({
        sessionId: trainingAnswers.sessionId,
        answered: sql<number>`count(DISTINCT ${trainingAnswers.questionId})::int`,
      })
      .from(trainingAnswers)
      .where(
        and(
          inArray(
            trainingAnswers.sessionId,
            sessions.map((session) => session.id),
          ),
          // Solo las evaluadas: una respuesta guardada cuya evaluacion fallo
          // deja la pregunta pendiente, y retomar tiene que caer en ella.
          isNotNull(trainingAnswers.scores),
        ),
      )
      .groupBy(trainingAnswers.sessionId);
    const answeredBySession = new Map(counted.map((row) => [row.sessionId, Number(row.answered)]));

    return {
      ok: true as const,
      data: sessions.map((session) => ({
        ...session,
        title: session.category ?? session.productName ?? "Práctica",
        answered: answeredBySession.get(session.id) ?? 0,
      })),
    };
  } catch {
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudieron cargar las practicas sin terminar." },
    };
  }
}

/**
 * Consolidado de una practica.
 *
 * Se apoya en `getTrainingSession` y no en una consulta propia para que la
 * tanda del resumen sea EXACTAMENTE la que se respondio: el orden barajado sale
 * del id de la sesion y el tope de `practice_size`, y duplicar esa derivacion
 * aqui abriria la puerta a un resumen de doce preguntas sobre una practica de
 * seis.
 */
export async function getPracticeSummary(sessionId: string, options: TrainingDependencies = {}) {
  const result = await getTrainingSession(sessionId, options);
  if (!result.ok) return result;
  const { questions, answers, ...session } = result.data;
  return {
    ok: true as const,
    data: {
      session,
      summary: buildPracticeSummary({
        questions,
        answers,
        activeSeconds: session.activeSeconds,
      }),
    },
  };
}
