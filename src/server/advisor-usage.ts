import { and, count, desc, eq, gte, sql } from "drizzle-orm";

import type { db } from "../db/client.ts";
import { pretrainingActivity, trainingSessions } from "../db/schema.ts";
import { businessDayColumn as businessDay } from "./business-day.ts";

export type UsageDay = {
  day: string;
  practices: number;
  trainingMinutes: number;
  pretrainingMinutes: number;
  totalMinutes: number;
};

/**
 * Tiempo de aprendizaje en los dos módulos que tienen medición activa.
 *
 * Los totales respetan el periodo elegido. La serie siempre usa `graphDays`:
 * para Todo son los últimos 30 días, que es lo que cabe legible en pantalla.
 */
export async function readAdvisorUsage(
  database: typeof db,
  advisorId: string,
  options: {
    selectedStart: Date | null;
    selectedDay: string | null;
    graphDays: string[];
  },
) {
  const graphStartDay = options.graphDays[0] as string;
  const graphStart = new Date(`${graphStartDay}T00:00:00-05:00`);

  const [trainingTotalRows, pretrainingTotalRows, trainingDays, pretrainingDays] =
    await Promise.all([
      database
        .select({
          started: count(),
          finished: sql<number>`count(${trainingSessions.finishedAt})::int`,
          seconds: sql<number>`coalesce(sum(${trainingSessions.activeSeconds}), 0)::int`,
        })
        .from(trainingSessions)
        .where(
          and(
            eq(trainingSessions.advisorId, advisorId),
            options.selectedStart
              ? gte(trainingSessions.startedAt, options.selectedStart)
              : undefined,
          ),
        ),
      database
        .select({
          seconds: sql<number>`coalesce(sum(${pretrainingActivity.activeSeconds}), 0)::int`,
          products: sql<number>`count(DISTINCT ${pretrainingActivity.productId})::int`,
        })
        .from(pretrainingActivity)
        .where(
          and(
            eq(pretrainingActivity.advisorId, advisorId),
            options.selectedDay
              ? gte(pretrainingActivity.studyDate, options.selectedDay)
              : undefined,
          ),
        ),
      database
        .select({
          day: businessDay(trainingSessions.startedAt),
          practices: count(),
          seconds: sql<number>`coalesce(sum(${trainingSessions.activeSeconds}), 0)::int`,
        })
        .from(trainingSessions)
        .where(
          and(
            eq(trainingSessions.advisorId, advisorId),
            gte(trainingSessions.startedAt, graphStart),
          ),
        )
        .groupBy(businessDay(trainingSessions.startedAt))
        .orderBy(desc(businessDay(trainingSessions.startedAt))),
      database
        .select({
          day: pretrainingActivity.studyDate,
          seconds: sql<number>`coalesce(sum(${pretrainingActivity.activeSeconds}), 0)::int`,
        })
        .from(pretrainingActivity)
        .where(
          and(
            eq(pretrainingActivity.advisorId, advisorId),
            gte(pretrainingActivity.studyDate, graphStartDay),
          ),
        )
        .groupBy(pretrainingActivity.studyDate)
        .orderBy(desc(pretrainingActivity.studyDate)),
    ]);

  const trainingTotal = trainingTotalRows[0];
  const pretrainingTotal = pretrainingTotalRows[0];
  const trainingByDay = new Map(trainingDays.map((row) => [row.day, row]));
  const pretrainingByDay = new Map(pretrainingDays.map((row) => [row.day, row]));
  const usageByDay: UsageDay[] = options.graphDays.map((day) => {
    const training = trainingByDay.get(day);
    const pretraining = pretrainingByDay.get(day);
    const trainingSeconds = Number(training?.seconds ?? 0);
    const pretrainingSeconds = Number(pretraining?.seconds ?? 0);
    const trainingMinutes = Math.round(trainingSeconds / 60);
    const pretrainingMinutes = Math.round(pretrainingSeconds / 60);
    return {
      day,
      practices: Number(training?.practices ?? 0),
      trainingMinutes,
      pretrainingMinutes,
      totalMinutes: Math.round((trainingSeconds + pretrainingSeconds) / 60),
    };
  });
  const trainingSeconds = Number(trainingTotal?.seconds ?? 0);
  const pretrainingSeconds = Number(pretrainingTotal?.seconds ?? 0);
  const trainingMinutes = Math.round(trainingSeconds / 60);
  const pretrainingMinutes = Math.round(pretrainingSeconds / 60);

  return {
    trainingMinutes,
    pretrainingMinutes,
    totalLearningMinutes: Math.round((trainingSeconds + pretrainingSeconds) / 60),
    productsStudied: Number(pretrainingTotal?.products ?? 0),
    practicesStarted: Number(trainingTotal?.started ?? 0),
    practicesFinished: Number(trainingTotal?.finished ?? 0),
    activeDays: usageByDay.filter((day) => day.totalMinutes > 0).length,
    usageByDay,
  };
}
