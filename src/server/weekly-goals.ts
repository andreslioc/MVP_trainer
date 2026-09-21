import { and, asc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/client.ts";
import {
  advisors,
  pretrainingActivity,
  trainingAnswers,
  trainingSessions,
  weeklyTrainingGoals,
} from "../db/schema.ts";
import { type AdvisorRole, requireRole } from "../lib/auth.ts";
import {
  isMonday,
  type WeeklyGoalProgress,
  weekBounds,
  weekStartFor,
  weeklyGoalStatus,
} from "../lib/weekly-goals.ts";

const weeklyGoalInputSchema = z
  .object({
    weekStart: z.iso.date().refine(isMonday, "La semana debe comenzar un lunes."),
    assignee: z.union([z.literal("all"), z.uuid()]),
    trainingSessionsTarget: z.coerce.number().int().min(0).max(100),
    pretrainingMinutesTarget: z.coerce.number().int().min(0).max(10080),
    productsTarget: z.coerce.number().int().min(0).max(500),
  })
  .refine(
    (value) =>
      value.trainingSessionsTarget > 0 ||
      value.pretrainingMinutesTarget > 0 ||
      value.productsTarget > 0,
    { message: "Define al menos un objetivo mayor que cero." },
  );

export type WeeklyGoalInput = z.input<typeof weeklyGoalInputSchema>;
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };
type Authorize = (role: AdvisorRole) => Promise<AuthorizationResult>;
type WeeklyGoalDatabase = Pick<typeof db, "select" | "insert">;

export type WeeklyGoalDependencies = {
  database?: WeeklyGoalDatabase;
  authorize?: Authorize;
  now?: () => Date;
};

function dependencies(options: WeeklyGoalDependencies) {
  return {
    database: options.database ?? db,
    authorize: options.authorize ?? requireRole,
    now: options.now ?? (() => new Date()),
  };
}

export async function saveWeeklyGoals(
  input: WeeklyGoalInput,
  options: WeeklyGoalDependencies = {},
) {
  const { database, authorize, now } = dependencies(options);
  const authorization = await authorize("admin");
  if (!authorization.ok) return authorization;

  const parsed = weeklyGoalInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { code: "VALIDATION" as const, message: z.prettifyError(parsed.error) },
    };
  }
  if (parsed.data.weekStart < weekStartFor(now())) {
    return {
      ok: false as const,
      error: { code: "PAST_WEEK" as const, message: "No se puede cambiar una semana vencida." },
    };
  }

  const advisorFilter = [eq(advisors.status, "activa"), eq(advisors.role, "asesor")];
  if (parsed.data.assignee !== "all") {
    advisorFilter.push(eq(advisors.id, parsed.data.assignee));
  }
  const recipients = await database
    .select({ id: advisors.id })
    .from(advisors)
    .where(and(...advisorFilter));

  if (recipients.length === 0) {
    return {
      ok: false as const,
      error: {
        code: "NO_RECIPIENTS" as const,
        message: "No hay asesoras activas para recibir esta meta.",
      },
    };
  }

  const updatedAt = now();
  await database
    .insert(weeklyTrainingGoals)
    .values(
      recipients.map(({ id }) => ({
        advisorId: id,
        weekStart: parsed.data.weekStart,
        trainingSessionsTarget: parsed.data.trainingSessionsTarget,
        pretrainingMinutesTarget: parsed.data.pretrainingMinutesTarget,
        productsTarget: parsed.data.productsTarget,
        createdBy: authorization.data.id,
        updatedAt,
      })),
    )
    .onConflictDoUpdate({
      target: [weeklyTrainingGoals.advisorId, weeklyTrainingGoals.weekStart],
      set: {
        trainingSessionsTarget: parsed.data.trainingSessionsTarget,
        pretrainingMinutesTarget: parsed.data.pretrainingMinutesTarget,
        productsTarget: parsed.data.productsTarget,
        createdBy: authorization.data.id,
        updatedAt,
      },
    });

  return { ok: true as const, data: { assigned: recipients.length } };
}

async function readProgress(
  database: WeeklyGoalDatabase,
  weekStart: string,
  options: { advisorId?: string; includeWithoutGoal: boolean },
): Promise<Array<WeeklyGoalProgress & { hasGoal: boolean }>> {
  const bounds = weekBounds(weekStart);
  const advisorConditions = [eq(advisors.status, "activa"), eq(advisors.role, "asesor")];
  if (options.advisorId) advisorConditions.push(eq(advisors.id, options.advisorId));

  const people = await database
    .select({
      advisorId: advisors.id,
      displayName: advisors.displayName,
      goalId: weeklyTrainingGoals.id,
      trainingTarget: weeklyTrainingGoals.trainingSessionsTarget,
      pretrainingTarget: weeklyTrainingGoals.pretrainingMinutesTarget,
      productsTarget: weeklyTrainingGoals.productsTarget,
    })
    .from(advisors)
    .leftJoin(
      weeklyTrainingGoals,
      and(
        eq(weeklyTrainingGoals.advisorId, advisors.id),
        eq(weeklyTrainingGoals.weekStart, weekStart),
      ),
    )
    .where(and(...advisorConditions))
    .orderBy(asc(advisors.displayName));

  const relevant = options.includeWithoutGoal ? people : people.filter((person) => person.goalId);
  const ids = relevant.map((person) => person.advisorId);
  if (ids.length === 0) return [];

  const [trainingRows, pretrainingRows] = await Promise.all([
    database
      .select({
        advisorId: trainingSessions.advisorId,
        completed: sql<number>`count(distinct ${trainingSessions.id})::int`,
      })
      .from(trainingSessions)
      .innerJoin(trainingAnswers, eq(trainingAnswers.sessionId, trainingSessions.id))
      .where(
        and(
          inArray(trainingSessions.advisorId, ids),
          gte(trainingSessions.startedAt, bounds.startInstant),
          lt(trainingSessions.startedAt, bounds.endInstant),
          isNotNull(trainingSessions.finishedAt),
          isNotNull(trainingAnswers.scores),
        ),
      )
      .groupBy(trainingSessions.advisorId),
    database
      .select({
        advisorId: pretrainingActivity.advisorId,
        minutes: sql<number>`floor(coalesce(sum(${pretrainingActivity.activeSeconds}), 0) / 60)::int`,
        products: sql<number>`count(distinct ${pretrainingActivity.productId})::int`,
      })
      .from(pretrainingActivity)
      .where(
        and(
          inArray(pretrainingActivity.advisorId, ids),
          gte(pretrainingActivity.studyDate, weekStart),
          lt(pretrainingActivity.studyDate, bounds.nextWeekStart),
        ),
      )
      .groupBy(pretrainingActivity.advisorId),
  ]);

  const trainingByAdvisor = new Map(
    trainingRows.map((row) => [row.advisorId, Number(row.completed)]),
  );
  const pretrainingByAdvisor = new Map(pretrainingRows.map((row) => [row.advisorId, row]));

  return relevant.map((person) => {
    const pretraining = pretrainingByAdvisor.get(person.advisorId);
    const metrics = {
      training: {
        current: trainingByAdvisor.get(person.advisorId) ?? 0,
        target: person.trainingTarget ?? 0,
      },
      pretraining: {
        current: Number(pretraining?.minutes ?? 0),
        target: person.pretrainingTarget ?? 0,
      },
      products: {
        current: Number(pretraining?.products ?? 0),
        target: person.productsTarget ?? 0,
      },
    };
    return {
      advisorId: person.advisorId,
      displayName: person.displayName,
      weekStart,
      weekEnd: bounds.weekEnd,
      hasGoal: person.goalId !== null,
      ...metrics,
      ...weeklyGoalStatus(metrics, weekStart),
    };
  });
}

export async function listWeeklyGoals(weekStart: string, options: WeeklyGoalDependencies = {}) {
  const { database, authorize } = dependencies(options);
  const authorization = await authorize("admin");
  if (!authorization.ok) return authorization;
  if (!z.iso.date().safeParse(weekStart).success || !isMonday(weekStart)) {
    return {
      ok: false as const,
      error: { code: "VALIDATION" as const, message: "La semana no es válida." },
    };
  }

  return {
    ok: true as const,
    data: await readProgress(database, weekStart, { includeWithoutGoal: true }),
  };
}

export async function getMyCurrentWeeklyGoal(options: WeeklyGoalDependencies = {}) {
  const { database, authorize, now } = dependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;
  const weekStart = weekStartFor(now());
  const rows = await readProgress(database, weekStart, {
    advisorId: authorization.data.id,
    includeWithoutGoal: false,
  });
  return { ok: true as const, data: rows[0] ?? null };
}
