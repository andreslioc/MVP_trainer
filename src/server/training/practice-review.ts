/**
 * Las practicas de UNA asesora, para quien la acompaña.
 *
 * Todas las lecturas de Training se atan al dueño de la sesion —esa es la
 * regla, y sigue en pie—. Este modulo es la unica puerta que autoriza POR RANGO
 * en vez de por propiedad, y existe porque el seguimiento lo hace la
 * supervision: sin esto, la unica persona que puede ver en que se equivoco una
 * asesora es la asesora misma, y el panel de analiticas se queda en promedios
 * que no dicen QUE dijo ni por que estuvo flojo.
 *
 * Es de solo lectura a proposito. Nadie que no sea la dueña de la practica
 * responde, reevalua ni borra: eso sigue pasando por `evaluate.ts`, que se ata
 * al dueño. Aca solo se lee.
 */

import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../db/client.ts";
import { advisors, products, trainingAnswers, trainingSessions } from "../../db/schema.ts";
import { type AdvisorRole, requireRole } from "../../lib/auth.ts";
import { buildPracticeSummary } from "../../lib/training/summary.ts";
import { readSessionForOwner } from "./session-read.ts";

/**
 * Cuantas practicas se listan.
 *
 * Cada clic en "Comenzar practica" abre una sesion, asi que el historial de una
 * asesora activa crece sin techo. Veinte cubre mas de lo que se revisa en una
 * sesion de acompañamiento; la pantalla dice que hay un tope.
 */
export const PRACTICE_REVIEW_LIMIT = 20;

type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };

export type ReviewDependencies = {
  authorize?: (role: AdvisorRole) => Promise<AuthorizationResult>;
  database?: typeof db;
};

const listSchema = z.object({ advisorId: z.uuid("La asesora no es valida.") }).strict();
const summarySchema = z
  .object({
    advisorId: z.uuid("La asesora no es valida."),
    sessionId: z.uuid("La practica no es valida."),
  })
  .strict();

function invalid(message: string | undefined) {
  return {
    ok: false as const,
    error: { code: "VALIDATION", message: message ?? "Entrada invalida." },
  };
}

/**
 * Quien es la asesora, si existe.
 *
 * Se resuelve SIEMPRE antes de leer practicas: un id inventado tiene que dar
 * NOT_FOUND, no una lista vacia que se leeria como "no ha practicado".
 */
async function readAdvisor(database: typeof db, advisorId: string) {
  const [advisor] = await database
    .select({ id: advisors.id, displayName: advisors.displayName, role: advisors.role })
    .from(advisors)
    .where(eq(advisors.id, advisorId))
    .limit(1);
  return advisor;
}

/**
 * El roster para elegir a quien revisar.
 *
 * Existe aparte de `listAdvisors` y no bajandole el rango a esa: el directorio
 * de cuentas devuelve el CORREO de cada persona y es la puerta a cambiarle
 * rango y estado, y eso sigue siendo trabajo de administracion. Para acompañar
 * hace falta el nombre, nada mas.
 */
export async function listReviewableAdvisors(options: ReviewDependencies = {}) {
  const authorize = options.authorize ?? requireRole;
  const database = options.database ?? db;
  const authorization = await authorize("supervisor");
  if (!authorization.ok) return authorization;

  try {
    const rows = await database
      .select({
        id: advisors.id,
        displayName: advisors.displayName,
        role: advisors.role,
        status: advisors.status,
      })
      .from(advisors)
      .orderBy(asc(advisors.displayName));
    return { ok: true as const, data: rows };
  } catch {
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudieron cargar las personas." },
    };
  }
}

export async function listAdvisorPractices(input: unknown, options: ReviewDependencies = {}) {
  const authorize = options.authorize ?? requireRole;
  const database = options.database ?? db;
  const authorization = await authorize("supervisor");
  if (!authorization.ok) return authorization;

  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const { advisorId } = parsed.data;

  try {
    const advisor = await readAdvisor(database, advisorId);
    if (!advisor) {
      return { ok: false as const, error: { code: "NOT_FOUND", message: "La asesora no existe." } };
    }

    const sessions = await database
      .select({
        id: trainingSessions.id,
        category: trainingSessions.category,
        practiceSize: trainingSessions.practiceSize,
        productName: products.name,
        startedAt: trainingSessions.startedAt,
        finishedAt: trainingSessions.finishedAt,
        activeSeconds: trainingSessions.activeSeconds,
      })
      .from(trainingSessions)
      // leftJoin: una practica por categoria no apunta a ninguna ficha.
      .leftJoin(products, eq(products.id, trainingSessions.productId))
      .where(eq(trainingSessions.advisorId, advisorId))
      .orderBy(desc(trainingSessions.startedAt))
      .limit(PRACTICE_REVIEW_LIMIT);
    if (sessions.length === 0) {
      return { ok: true as const, data: { advisor, practices: [] } };
    }

    // Agrupada aparte y no correlacionada en la lista de seleccion: ahi las
    // columnas interpoladas salen sin calificar (ver listOpenPractices).
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
          // Solo las evaluadas: una respuesta cuya evaluacion fallo no tiene
          // nota ni feedback, y no hay nada que revisar en ella.
          isNotNull(trainingAnswers.scores),
        ),
      )
      .groupBy(trainingAnswers.sessionId);
    const answeredBySession = new Map(counted.map((row) => [row.sessionId, Number(row.answered)]));

    return {
      ok: true as const,
      data: {
        advisor,
        practices: sessions.map((session) => ({
          ...session,
          title: session.category ?? session.productName ?? "Práctica",
          answered: answeredBySession.get(session.id) ?? 0,
        })),
      },
    };
  } catch {
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudieron cargar las practicas." },
    };
  }
}

/**
 * El consolidado de UNA practica de esa asesora.
 *
 * Reusa `readSessionForOwner` pasandole el id de la asesora revisada como
 * dueño, no el de quien mira. Dos consecuencias que importan: el resumen es
 * byte por byte el mismo que ve la asesora —misma tanda barajada, mismo tope— y
 * un `sessionId` que pertenezca a otra persona devuelve NOT_FOUND, porque el
 * WHERE sigue exigiendo dueño. La supervision no puede recorrer practicas
 * ajenas cambiando el id en la barra de direcciones sin acertar tambien la
 * asesora, y en todo caso solo ve a quien ya podia ver en analiticas.
 */
export async function getAdvisorPracticeSummary(input: unknown, options: ReviewDependencies = {}) {
  const authorize = options.authorize ?? requireRole;
  const database = options.database ?? db;
  const authorization = await authorize("supervisor");
  if (!authorization.ok) return authorization;

  const parsed = summarySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const { advisorId, sessionId } = parsed.data;

  const advisor = await readAdvisor(database, advisorId).catch(() => undefined);
  if (!advisor) {
    return { ok: false as const, error: { code: "NOT_FOUND", message: "La asesora no existe." } };
  }

  const result = await readSessionForOwner(database, sessionId, advisorId);
  if (!result.ok) return result;
  const { questions, answers, ...session } = result.data;
  return {
    ok: true as const,
    data: {
      advisor,
      session,
      summary: buildPracticeSummary({ questions, answers, activeSeconds: session.activeSeconds }),
    },
  };
}
