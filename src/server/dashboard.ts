import { count, eq, sql, sum } from "drizzle-orm";

import { db } from "../db/client.ts";
import {
  copilotExchanges,
  insights,
  liveRecordings,
  liveSessions,
  llmCalls,
  trainingAnswers,
  trainingSessions,
} from "../db/schema.ts";
import { type AdvisorRole, requireRole } from "../lib/auth.ts";

type DashboardDatabase = Pick<typeof db, "select">;
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };

export type DashboardDependencies = {
  authorize?: (role: AdvisorRole) => Promise<AuthorizationResult>;
  database?: DashboardDatabase;
};

export type DashboardMetrics = {
  scope: "propio" | "organizacion";
  trainingSessions: number;
  answers: number;
  liveSessions: number;
  copilotAnswers: number;
  recordingsAnalyzed: number;
  insights: number;
  /** Solo para admin: el costo es un dato de la organizacion, no del asesor. */
  costUsd: number | null;
};

function toNumber(value: string | number | null) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

/**
 * Metricas del dashboard, con el alcance decidido por el rol.
 *
 * El servidor conecta saltando RLS (§8), asi que el aislamiento de la asesora es
 * el filtro explicito por `advisor_id` que se ve aqui. Una asesora nunca ve
 * numeros de otra; el costo total solo lo ve un admin, porque es informacion de
 * negocio y no de desempeno individual.
 */
export async function getDashboardMetrics(
  options: DashboardDependencies = {},
): Promise<
  { ok: true; data: DashboardMetrics } | { ok: false; error: { code: string; message: string } }
> {
  const authorize = options.authorize ?? requireRole;
  const database = options.database ?? db;
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;

  const { id: advisorId, role } = authorization.data;
  const isAdmin = role === "admin";

  try {
    const scoped = <T extends { advisorId: unknown }>(table: T) =>
      isAdmin ? undefined : eq(table.advisorId as never, advisorId);

    const [training] = await database
      .select({ value: count() })
      .from(trainingSessions)
      .where(scoped(trainingSessions));
    const [answers] = await database
      .select({ value: count() })
      .from(trainingAnswers)
      .innerJoin(trainingSessions, eq(trainingSessions.id, trainingAnswers.sessionId))
      .where(scoped(trainingSessions));
    const [live] = await database
      .select({ value: count() })
      .from(liveSessions)
      .where(scoped(liveSessions));
    const [copilot] = await database
      .select({ value: count() })
      .from(copilotExchanges)
      .innerJoin(liveSessions, eq(liveSessions.id, copilotExchanges.liveSessionId))
      .where(scoped(liveSessions));
    const [analyzed] = await database
      .select({ value: count() })
      .from(liveRecordings)
      .where(
        isAdmin
          ? eq(liveRecordings.status, "analyzed")
          : sql`${liveRecordings.advisorId} = ${advisorId} and ${liveRecordings.status} = 'analyzed'`,
      );
    const [found] = await database
      .select({ value: count() })
      .from(insights)
      .innerJoin(liveRecordings, eq(liveRecordings.id, insights.recordingId))
      .where(scoped(liveRecordings));

    let costUsd: number | null = null;
    if (isAdmin) {
      const [cost] = await database.select({ value: sum(llmCalls.costUsd) }).from(llmCalls);
      costUsd = toNumber(cost?.value ?? 0);
    }

    return {
      ok: true as const,
      data: {
        scope: isAdmin ? ("organizacion" as const) : ("propio" as const),
        trainingSessions: training?.value ?? 0,
        answers: answers?.value ?? 0,
        liveSessions: live?.value ?? 0,
        copilotAnswers: copilot?.value ?? 0,
        recordingsAnalyzed: analyzed?.value ?? 0,
        insights: found?.value ?? 0,
        costUsd,
      },
    };
  } catch {
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudieron calcular las métricas." },
    };
  }
}
