import { and, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/client.ts";
import { pretrainingActivity, products } from "../db/schema.ts";
import { businessToday } from "../lib/analytics-period.ts";
import { type AdvisorRole, requireRole } from "../lib/auth.ts";
import { MAX_PULSE_SECONDS } from "./training/practice-time.ts";

/** Una ficha no puede acumular mas segundos que los que caben en un dia. */
const MAX_DAILY_PRODUCT_SECONDS = 86_400;

const pulseSchema = z
  .object({
    productId: z.uuid("La ficha no es valida."),
    seconds: z
      .number()
      .int("Los segundos deben ser un entero.")
      .min(1, "El pulso no puede ser cero.")
      .max(MAX_PULSE_SECONDS, `Un pulso no puede pasar de ${MAX_PULSE_SECONDS} segundos.`),
  })
  .strict();

type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };

type PretrainingTimeDependencies = {
  authorize?: (role: AdvisorRole) => Promise<AuthorizationResult>;
  database?: typeof db;
  now?: () => Date;
};

/**
 * Suma tiempo activo a la ficha y al dia de Bogota en que ocurrio el pulso.
 *
 * La identidad sale de la sesion y la fecha sale del servidor. El navegador
 * solo informa un tramo corto y acotado; no puede escoger otra asesora ni
 * atribuir el tiempo a otro dia. El upsert hace atomica la suma cuando dos
 * pulsos llegan casi al mismo tiempo.
 */
export async function recordPretrainingTime(
  input: unknown,
  options: PretrainingTimeDependencies = {},
) {
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

  // No basta con un UUID bien formado: solo se puede estudiar una ficha que
  // existe y ya fue verificada, la misma regla que protege la pagina.
  const [product] = await database
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, parsed.data.productId), isNotNull(products.verifiedAt)))
    .limit(1);
  if (!product) {
    return {
      ok: false as const,
      error: { code: "NOT_FOUND", message: "La ficha no existe o aun no esta verificada." },
    };
  }

  const now = (options.now ?? (() => new Date()))();
  const studyDate = businessToday(now);
  const [updated] = await database
    .insert(pretrainingActivity)
    .values({
      advisorId: authorization.data.id,
      productId: product.id,
      studyDate,
      activeSeconds: parsed.data.seconds,
      lastActivityAt: now,
    })
    .onConflictDoUpdate({
      target: [
        pretrainingActivity.advisorId,
        pretrainingActivity.productId,
        pretrainingActivity.studyDate,
      ],
      set: {
        activeSeconds: sql`least(${pretrainingActivity.activeSeconds} + ${parsed.data.seconds}, ${MAX_DAILY_PRODUCT_SECONDS})`,
        lastActivityAt: now,
      },
    })
    .returning({
      activeSeconds: pretrainingActivity.activeSeconds,
      studyDate: pretrainingActivity.studyDate,
    });

  if (!updated) {
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudo guardar el tiempo de estudio." },
    };
  }

  return { ok: true as const, data: updated };
}

/** Tiempo de hoy por ficha para que la asesora vea lo que ya estudio. */
export async function listTodayPretrainingTime(options: PretrainingTimeDependencies = {}) {
  const authorize = options.authorize ?? requireRole;
  const database = options.database ?? db;
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;

  const studyDate = businessToday((options.now ?? (() => new Date()))());
  const rows = await database
    .select({
      productId: pretrainingActivity.productId,
      activeSeconds: pretrainingActivity.activeSeconds,
    })
    .from(pretrainingActivity)
    .where(
      and(
        eq(pretrainingActivity.advisorId, authorization.data.id),
        eq(pretrainingActivity.studyDate, studyDate),
      ),
    );

  return { ok: true as const, data: rows };
}
