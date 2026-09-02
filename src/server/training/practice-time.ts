import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../db/client.ts";
import { trainingAnswers, trainingQuestions, trainingSessions } from "../../db/schema.ts";
import { type AdvisorRole, requireRole } from "../../lib/auth.ts";

/**
 * Tiempo de practica real, acumulado en pulsos desde la pantalla.
 *
 * El tiempo NO se deriva de `finished_at - started_at`: una pestaña olvidada
 * abierta toda la noche daria ocho horas de practica y el dato dejaria de
 * significar algo. La pantalla cuenta solo mientras esta visible y hay
 * actividad, y manda lo acumulado cada cierto rato.
 */

/**
 * Cuanto puede sumar un solo pulso.
 *
 * La pantalla manda uno cada 30 segundos, y el tope deja margen para un
 * navegador que se demoro o una pestaña que volvio del fondo. Sin tope, un
 * cliente roto —o uno manipulado— podria mandar 100.000 y el panel del
 * administrador mostraria un numero inventado.
 */
export const MAX_PULSE_SECONDS = 90;

/** Tope diario por sesion, el mismo que impone la restriccion de la tabla. */
const MAX_SESSION_SECONDS = 86_400;

const pulseSchema = z
  .object({
    sessionId: z.uuid("La sesion no es valida."),
    seconds: z
      .number()
      .int("Los segundos deben ser un entero.")
      .min(1, "El pulso no puede ser cero.")
      .max(MAX_PULSE_SECONDS, `Un pulso no puede pasar de ${MAX_PULSE_SECONDS} segundos.`),
  })
  .strict();

/**
 * El mismo contrato estrecho que usa `dashboard.ts`: una prueba puede pasar un
 * doble con id y rol en vez de fabricar una fila completa de `advisors`.
 */
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };

type PracticeTimeDependencies = {
  authorize?: (role: AdvisorRole) => Promise<AuthorizationResult>;
  database?: typeof db;
};

export async function recordPracticeTime(input: unknown, options: PracticeTimeDependencies = {}) {
  const authorize = options.authorize ?? requireRole;
  const database = options.database ?? db;
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;

  const parsed = pulseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: {
        code: "VALIDATION",
        message: parsed.error.issues[0]?.message ?? "El pulso no es valido.",
        field: parsed.error.issues[0]?.path.join(".") || undefined,
      },
    };
  }

  // El acumulado se calcula en la base y no en el servidor de la app: dos
  // pestañas de la misma practica sumando a la vez leerian el mismo valor
  // viejo y una de las dos escrituras se perderia.
  const [updated] = await database
    .update(trainingSessions)
    .set({
      activeSeconds: sql`least(${trainingSessions.activeSeconds} + ${parsed.data.seconds}, ${MAX_SESSION_SECONDS})`,
    })
    .where(
      and(
        eq(trainingSessions.id, parsed.data.sessionId),
        // La sesion tiene que ser de quien manda el pulso. Sin esto, el id de
        // una practica ajena sumaria tiempo a otra asesora.
        eq(trainingSessions.advisorId, authorization.data.id),
      ),
    )
    .returning({ activeSeconds: trainingSessions.activeSeconds });

  if (!updated) {
    return {
      ok: false as const,
      error: { code: "NOT_FOUND", message: "La practica no existe o no es tuya." },
    };
  }
  return { ok: true as const, data: { activeSeconds: updated.activeSeconds } };
}

/**
 * Cierra la practica si la asesora ya respondio su tanda completa.
 *
 * Sin esto ninguna sesion se cierra —las 18 que existian tenian `finished_at`
 * en nulo— y el panel no puede distinguir una practica terminada de una
 * abandonada a la mitad, que es justo la diferencia que le interesa a quien
 * mira las analiticas.
 *
 * Cuantas preguntas son la tanda: `practice_size` cuando la practica es por
 * categoria, y todas las preguntas de la ficha cuando es de una sola. La fecha
 * se escribe una sola vez: reescribirla en cada respuesta posterior correria el
 * cierre hacia adelante.
 */
export async function finishPracticeIfComplete(
  sessionId: string,
  options: PracticeTimeDependencies = {},
) {
  const database = options.database ?? db;
  const [session] = await database
    .select({
      practiceSize: trainingSessions.practiceSize,
      productId: trainingSessions.productId,
      finishedAt: trainingSessions.finishedAt,
    })
    .from(trainingSessions)
    .where(eq(trainingSessions.id, sessionId))
    .limit(1);
  if (!session || session.finishedAt) return null;

  // Tres consultas sueltas y ninguna subconsulta correlacionada. La version
  // anterior metia los conteos como subconsultas en la lista de seleccion, y
  // ahi las columnas interpoladas salian sin calificar: `ta.session_id = id`
  // se ataba a `ta.id` —cero respuestas siempre— y `tq.product_id =
  // product_id` se comparaba consigo misma, contando TODAS las preguntas de la
  // base. Una practica no se habria cerrado nunca.
  const [respondidas] = await database
    .select({ value: sql<number>`count(DISTINCT ${trainingAnswers.questionId})::int` })
    .from(trainingAnswers)
    .where(eq(trainingAnswers.sessionId, sessionId));

  let tanda = session.practiceSize ?? 0;
  if (!session.practiceSize && session.productId) {
    const [dela] = await database
      .select({ value: sql<number>`count(*)::int` })
      .from(trainingQuestions)
      .where(eq(trainingQuestions.productId, session.productId));
    tanda = Number(dela?.value ?? 0);
  }
  if (tanda <= 0 || Number(respondidas?.value ?? 0) < tanda) return null;

  const [updated] = await database
    .update(trainingSessions)
    .set({ finishedAt: new Date() })
    // Solo la primera vez: reescribirlo en cada respuesta posterior correria
    // la fecha de cierre hacia adelante.
    .where(and(eq(trainingSessions.id, sessionId), sql`${trainingSessions.finishedAt} is null`))
    .returning({ finishedAt: trainingSessions.finishedAt });
  return updated?.finishedAt ?? null;
}
