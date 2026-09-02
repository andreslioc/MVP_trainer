import { type SQLWrapper, and, count, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
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
import {
  ANALYTICS_PERIODS,
  type AnalyticsPeriod,
  BUSINESS_TIMEZONE,
  periodDayKeys,
  periodStart,
} from "../lib/analytics-period.ts";
import { type AdvisorRole, requireRole } from "../lib/auth.ts";
import { CALIBRATION_ANSWERS, type DimensionScore, readDimensionScores } from "./advisor-scores.ts";

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

const inputSchema = z
  .object({
    advisorId: z.uuid("La asesora no es valida."),
    // Por defecto 30 dias y no "todo": el panel se lee para decidir a quien
    // acompañar esta semana, y un promedio de toda la historia esconde tanto la
    // mejora reciente como la caida reciente.
    period: z.enum(ANALYTICS_PERIODS).default("mes"),
  })
  .strict();

/**
 * El dia calendario EN BOGOTA de una columna de fecha.
 *
 * Sin el `AT TIME ZONE`, Postgres agrupa por dia UTC y una practica de las
 * siete de la noche en Colombia cae en el dia siguiente. El panel mostraria
 * actividad en un dia en el que nadie practico.
 */
function diaDelNegocio(columna: SQLWrapper) {
  return sql<string>`to_char(date_trunc('day', ${columna} AT TIME ZONE ${sql.raw(`'${BUSINESS_TIMEZONE}'`)}), 'YYYY-MM-DD')`;
}

export { CALIBRATION_ANSWERS } from "./advisor-scores.ts";
export type { DimensionScore } from "./advisor-scores.ts";

export type AdvisorAnalytics = {
  advisor: { id: string; displayName: string; role: string; status: string };
  /** La ventana con la que se calculo todo lo demas. */
  period: AnalyticsPeriod;
  /** Los dias que dibuja la grafica de columnas, del mas antiguo al ultimo. */
  windowDays: string[];
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
  const { advisorId, period } = parsed.data;
  // `undefined` cuando la ventana es "todo": `and()` de drizzle lo descarta, asi
  // que la misma consulta sirve con filtro y sin el.
  const desde = periodStart(period);
  const dentro = (columna: Parameters<typeof gte>[0]) => (desde ? gte(columna, desde) : undefined);

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
    .where(and(eq(trainingSessions.advisorId, advisorId), dentro(trainingSessions.startedAt)));

  // CALIFICADAS, no enviadas. La tarjeta dice "Respuestas evaluadas" y esta
  // justo encima de la tabla que promedia la rubrica: contar tambien las que
  // quedaron sin nota presentaba dos conjuntos distintos como si fueran uno
  // —23 arriba, 16 en la tabla— sin que nada en pantalla lo explicara.
  const [respuestas] = await database
    .select({
      total: count(),
      products: sql<number>`count(DISTINCT ${trainingQuestions.productId})::int`,
    })
    .from(trainingAnswers)
    .innerJoin(trainingSessions, eq(trainingSessions.id, trainingAnswers.sessionId))
    .innerJoin(trainingQuestions, eq(trainingQuestions.id, trainingAnswers.questionId))
    .where(
      and(
        eq(trainingSessions.advisorId, advisorId),
        isNotNull(trainingAnswers.scores),
        dentro(trainingAnswers.createdAt),
      ),
    );

  const puntuacion = await readDimensionScores(database, advisorId, desde);
  const { dimensions, scoredAnswers, accuracyPercent } = puntuacion;

  // Las columnas cubren la ventana elegida; con "todo" se quedan en 30 dias,
  // que es lo que cabe legible en una grafica pequeña.
  const diasVentana = periodDayKeys(period);
  const desdeColumnas = new Date(`${diasVentana[0]}T00:00:00-05:00`);
  const dias = await database
    .select({
      day: diaDelNegocio(trainingSessions.startedAt),
      practices: count(),
      minutes: sql<number>`round(coalesce(sum(${trainingSessions.activeSeconds}), 0) / 60.0)::int`,
    })
    .from(trainingSessions)
    .where(
      and(
        eq(trainingSessions.advisorId, advisorId),
        gte(trainingSessions.startedAt, desdeColumnas),
      ),
    )
    .groupBy(diaDelNegocio(trainingSessions.startedAt))
    .orderBy(desc(diaDelNegocio(trainingSessions.startedAt)));

  // Doce puntos: los que caben en una linea pequeña sin volverse ruido.
  const historial = await database
    .select({
      day: diaDelNegocio(trainingAnswers.createdAt),
      answers: count(),
    })
    .from(trainingAnswers)
    .innerJoin(trainingSessions, eq(trainingSessions.id, trainingAnswers.sessionId))
    .where(
      and(
        eq(trainingSessions.advisorId, advisorId),
        isNotNull(trainingAnswers.scores),
        dentro(trainingAnswers.createdAt),
      ),
    )
    .groupBy(diaDelNegocio(trainingAnswers.createdAt))
    .orderBy(diaDelNegocio(trainingAnswers.createdAt));

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
    .where(and(eq(liveSessions.advisorId, advisorId), dentro(liveSessions.startedAt)));

  const answers = Number(respuestas?.total ?? 0);
  return {
    ok: true as const,
    data: {
      advisor,
      period,
      windowDays: diasVentana,
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
