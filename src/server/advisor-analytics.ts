import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/client.ts";
import {
  advisors,
  copilotExchanges,
  liveSessions,
  trainingAnswers,
  trainingQuestions,
  trainingSessions,
} from "../db/schema.ts";
import { type AdvisorRole, requireRole } from "../lib/auth.ts";

/**
 * Analiticas de UNA asesora, para que el administrador vea donde ayudarla.
 *
 * Dos decisiones que definen si el panel dice la verdad:
 *
 * 1. El tiempo sale de `active_seconds`, que la pantalla acumula solo mientras
 *    la asesora esta practicando. Nunca de `finished_at - started_at`: una
 *    pestaña olvidada abierta daria horas de practica que no ocurrieron.
 * 2. El acierto convierte la escala de la rubrica —1 a 5— a porcentaje con
 *    (nota - 1) / 4. El piso de la rubrica es 1, no 0: dividir por 5 haria que
 *    la peor respuesta posible apareciera con 20% de acierto.
 */

/** La rubrica va de 1 a 5. Vive aca porque de esto depende el porcentaje. */
const RUBRIC_MIN = 1;
const RUBRIC_MAX = 5;

/**
 * Cuantas respuestas hacen falta para dejar de calibrar.
 *
 * Con menos, el promedio se mueve entero con una sola respuesta buena o mala,
 * y presentarlo como un puntaje firme es engañar a quien decide con el. El
 * panel lo dice en pantalla en vez de esconderlo.
 */
export const CALIBRATION_ANSWERS = 12;

const inputSchema = z.object({ advisorId: z.uuid("La asesora no es valida.") }).strict();

export type DimensionScore = {
  dimension: string;
  average: number;
  percent: number;
  answers: number;
};

export type AdvisorAnalytics = {
  advisor: { id: string; displayName: string; role: string; status: string };
  practiceMinutes: number;
  practicesStarted: number;
  practicesFinished: number;
  answers: number;
  /** Nulo mientras no haya ni una respuesta calificada: un 0% seria mentira. */
  accuracyPercent: number | null;
  calibrating: boolean;
  answersToCalibrate: number;
  dimensions: DimensionScore[];
  productsPracticed: number;
  activityByDay: Array<{ day: string; practices: number; minutes: number }>;
  /**
   * Respuestas acumuladas por dia, para la linea que crece.
   *
   * Acumuladas y no por dia a proposito: lo que motiva es ver que el total sube,
   * no que el martes hubo dos. Es el equivalente honesto del "vocabulario" que
   * crece en las apps de idiomas.
   */
  answerHistory: Array<{ day: string; total: number }>;
  liveSessions: number;
  copilotAnswers: number;
  copilotAlerts: number;
};

/**
 * El mismo contrato estrecho que usa `dashboard.ts`: una prueba puede pasar un
 * doble con id y rol en vez de fabricar una fila completa de `advisors`.
 */
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };

type Dependencies = {
  authorize?: (role: AdvisorRole) => Promise<AuthorizationResult>;
  database?: typeof db;
};

function toPercent(average: number) {
  return Math.round(((average - RUBRIC_MIN) / (RUBRIC_MAX - RUBRIC_MIN)) * 100);
}

export async function getAdvisorAnalytics(input: unknown, options: Dependencies = {}) {
  const authorize = options.authorize ?? requireRole;
  const database = options.database ?? db;
  // Solo el administrador: las analiticas de una asesora las mira quien la
  // acompaña, no sus pares.
  const authorization = await authorize("admin");
  if (!authorization.ok) return authorization;

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: {
        code: "VALIDATION",
        message: parsed.error.issues[0]?.message ?? "Entrada invalida.",
      },
    };
  }
  const { advisorId } = parsed.data;

  const [advisor] = await database
    .select({
      id: advisors.id,
      displayName: advisors.displayName,
      role: advisors.role,
      status: advisors.status,
    })
    .from(advisors)
    .where(eq(advisors.id, advisorId))
    .limit(1);
  if (!advisor) {
    return { ok: false as const, error: { code: "NOT_FOUND", message: "La asesora no existe." } };
  }

  const [practica] = await database
    .select({
      started: count(),
      finished: sql<number>`count(${trainingSessions.finishedAt})::int`,
      seconds: sql<number>`coalesce(sum(${trainingSessions.activeSeconds}), 0)::int`,
    })
    .from(trainingSessions)
    .where(eq(trainingSessions.advisorId, advisorId));

  const [respuestas] = await database
    .select({
      total: count(),
      products: sql<number>`count(DISTINCT ${trainingQuestions.productId})::int`,
    })
    .from(trainingAnswers)
    .innerJoin(trainingSessions, eq(trainingSessions.id, trainingAnswers.sessionId))
    .innerJoin(trainingQuestions, eq(trainingQuestions.id, trainingAnswers.questionId))
    .where(eq(trainingSessions.advisorId, advisorId));

  // Las dimensiones salen del jsonb de notas: son las mismas nueve que escribe
  // la rubrica, y se leen de los datos en vez de repetirse aca, para que una
  // dimension nueva aparezca en el panel sin tocar este archivo.
  const dimensionRows = await database.execute(sql`
    SELECT d.key AS dimension,
           count(*)::int AS answers,
           avg((d.value->>'score')::numeric) AS average
    FROM ${trainingAnswers} ta
    JOIN ${trainingSessions} ts ON ts.id = ta.session_id
    CROSS JOIN LATERAL jsonb_each(ta.scores) d
    WHERE ts.advisor_id = ${advisorId} AND ta.scores IS NOT NULL
    GROUP BY d.key
    ORDER BY avg((d.value->>'score')::numeric) ASC`);

  const dimensions: DimensionScore[] = [...dimensionRows].map((row) => {
    const average = Number(row.average ?? 0);
    return {
      dimension: String(row.dimension),
      average: Math.round(average * 10) / 10,
      percent: toPercent(average),
      answers: Number(row.answers ?? 0),
    };
  });

  // Cuantas RESPUESTAS estan calificadas, no cuantos pares dimension-respuesta.
  // La rubrica califica las nueve dimensiones de cada respuesta, asi que sumar
  // los conteos por dimension multiplicaba por nueve: con dos respuestas el
  // panel ya se declaraba calibrado y mostraba el puntaje como firme.
  const scoredAnswers = dimensions.reduce((mayor, item) => Math.max(mayor, item.answers), 0);
  const pesoTotal = dimensions.reduce((total, item) => total + item.answers, 0);
  const accuracyPercent =
    dimensions.length === 0 || pesoTotal === 0
      ? null
      : toPercent(
          dimensions.reduce((total, item) => total + item.average * item.answers, 0) / pesoTotal,
        );

  const desde = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  const dias = await database
    .select({
      day: sql<string>`to_char(date_trunc('day', ${trainingSessions.startedAt}), 'YYYY-MM-DD')`,
      practices: count(),
      minutes: sql<number>`round(coalesce(sum(${trainingSessions.activeSeconds}), 0) / 60.0)::int`,
    })
    .from(trainingSessions)
    .where(and(eq(trainingSessions.advisorId, advisorId), gte(trainingSessions.startedAt, desde)))
    .groupBy(sql`date_trunc('day', ${trainingSessions.startedAt})`)
    .orderBy(desc(sql`date_trunc('day', ${trainingSessions.startedAt})`));

  // Doce puntos: los que caben en una linea pequeña sin volverse ruido.
  const historial = await database
    .select({
      day: sql<string>`to_char(date_trunc('day', ${trainingAnswers.createdAt}), 'YYYY-MM-DD')`,
      answers: count(),
    })
    .from(trainingAnswers)
    .innerJoin(trainingSessions, eq(trainingSessions.id, trainingAnswers.sessionId))
    .where(eq(trainingSessions.advisorId, advisorId))
    .groupBy(sql`date_trunc('day', ${trainingAnswers.createdAt})`)
    .orderBy(sql`date_trunc('day', ${trainingAnswers.createdAt})`);

  let acumulado = 0;
  const answerHistory = historial.slice(-12).map((fila) => {
    acumulado += Number(fila.answers);
    return { day: fila.day, total: acumulado };
  });

  const [vivo] = await database
    .select({
      sessions: sql<number>`count(DISTINCT ${liveSessions.id})::int`,
      answers: sql<number>`count(${copilotExchanges.id})::int`,
      alerts: sql<number>`coalesce(sum(jsonb_array_length(${copilotExchanges.alerts})), 0)::int`,
    })
    .from(liveSessions)
    .leftJoin(copilotExchanges, eq(copilotExchanges.liveSessionId, liveSessions.id))
    .where(eq(liveSessions.advisorId, advisorId));

  const answers = Number(respuestas?.total ?? 0);
  return {
    ok: true as const,
    data: {
      advisor,
      practiceMinutes: Math.round(Number(practica?.seconds ?? 0) / 60),
      practicesStarted: Number(practica?.started ?? 0),
      practicesFinished: Number(practica?.finished ?? 0),
      answers,
      accuracyPercent,
      calibrating: scoredAnswers > 0 && scoredAnswers < CALIBRATION_ANSWERS,
      answersToCalibrate: Math.max(CALIBRATION_ANSWERS - scoredAnswers, 0),
      dimensions,
      productsPracticed: Number(respuestas?.products ?? 0),
      activityByDay: dias.map((d) => ({
        day: d.day,
        practices: Number(d.practices),
        minutes: Number(d.minutes),
      })),
      answerHistory,
      liveSessions: Number(vivo?.sessions ?? 0),
      copilotAnswers: Number(vivo?.answers ?? 0),
      copilotAlerts: Number(vivo?.alerts ?? 0),
    } satisfies AdvisorAnalytics,
  };
}
