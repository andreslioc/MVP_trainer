import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../db/client.ts";
import { commercialRules, liveSessions, products } from "../../db/schema.ts";
import { type AdvisorRole, requireRole } from "../../lib/auth.ts";

type SessionDatabase = Pick<typeof db, "insert" | "select" | "update">;
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };
type Authorize = (role: AdvisorRole) => Promise<AuthorizationResult>;

export type CopilotSessionDependencies = { database?: SessionDatabase; authorize?: Authorize };

function dependencies(options: CopilotSessionDependencies) {
  return { database: options.database ?? db, authorize: options.authorize ?? requireRole };
}

export async function getCopilotSetup(options: CopilotSessionDependencies = {}) {
  const { database, authorize } = dependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;

  try {
    const [productRows, ruleRows, activeRows] = await Promise.all([
      database
        .select({
          id: products.id,
          name: products.name,
          brand: products.brand,
          priceCop: products.priceCop,
        })
        .from(products)
        .where(isNotNull(products.verifiedAt))
        .orderBy(asc(products.name)),
      database
        .select({ key: commercialRules.key, value: commercialRules.value })
        .from(commercialRules)
        .where(eq(commercialRules.active, true))
        .orderBy(asc(commercialRules.key)),
      database
        .select({
          id: liveSessions.id,
          startedAt: liveSessions.startedAt,
          productPromos: liveSessions.productPromos,
        })
        .from(liveSessions)
        .where(and(eq(liveSessions.advisorId, authorization.data.id), isNull(liveSessions.endedAt)))
        .orderBy(desc(liveSessions.startedAt))
        .limit(1),
    ]);
    return {
      ok: true as const,
      data: { products: productRows, activeRules: ruleRows, activeSession: activeRows[0] ?? null },
    };
  } catch {
    return {
      ok: false as const,
      error: { code: "COPILOT_SETUP_FAILED", message: "No se pudo cargar el Copilot." },
    };
  }
}

export async function startLiveSession(options: CopilotSessionDependencies = {}) {
  const { database, authorize } = dependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;

  try {
    const [existing] = await database
      .select()
      .from(liveSessions)
      .where(and(eq(liveSessions.advisorId, authorization.data.id), isNull(liveSessions.endedAt)))
      .orderBy(desc(liveSessions.startedAt))
      .limit(1);
    if (existing) return { ok: true as const, data: existing };
    const [created] = await database
      .insert(liveSessions)
      .values({ advisorId: authorization.data.id })
      .returning();
    if (!created) throw new Error("No se creo la sesion.");
    return { ok: true as const, data: created };
  } catch {
    return {
      ok: false as const,
      error: { code: "LIVE_SESSION_START_FAILED", message: "No se pudo iniciar el live." },
    };
  }
}

export async function endLiveSession(sessionId: string, options: CopilotSessionDependencies = {}) {
  const { database, authorize } = dependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;
  const parsedId = z.uuid().safeParse(sessionId);
  if (!parsedId.success) {
    return { ok: false as const, error: { code: "VALIDATION", message: "Sesion invalida." } };
  }

  try {
    const [ended] = await database
      .update(liveSessions)
      .set({ endedAt: new Date() })
      .where(
        and(
          eq(liveSessions.id, parsedId.data),
          eq(liveSessions.advisorId, authorization.data.id),
          isNull(liveSessions.endedAt),
        ),
      )
      .returning();
    if (!ended) {
      return { ok: false as const, error: { code: "NOT_FOUND", message: "El live no existe." } };
    }
    return { ok: true as const, data: ended };
  } catch {
    return {
      ok: false as const,
      error: { code: "LIVE_SESSION_END_FAILED", message: "No se pudo finalizar el live." },
    };
  }
}

const promoInputSchema = z.object({
  sessionId: z.uuid(),
  productId: z.uuid(),
  /** Nulo apaga el precio especial de ese producto. */
  percent: z
    .number()
    .int()
    .min(1, "El descuento minimo es 1%.")
    .max(99, "El descuento maximo es 99%.")
    .nullable(),
});

/**
 * Prende o apaga el precio especial de un producto durante ESTE live.
 *
 * Vive en la sesion y no en la ficha a proposito: el precio de lista es dato
 * durable del catalogo —que solo escribe admin—, y el descuento es del momento.
 * Una asesora si es duena de su sesion, asi que puede prenderlo sin tocar
 * `products`, y al terminar el live el descuento no sobrevive por descuido.
 */
export async function setSessionPromo(input: unknown, options: CopilotSessionDependencies = {}) {
  const { database, authorize } = dependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;

  const parsed = promoInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: {
        code: "VALIDATION",
        message: z.prettifyError(parsed.error),
        field: parsed.error.issues[0]?.path[0]?.toString(),
      },
    };
  }

  try {
    const [session] = await database
      .select({ id: liveSessions.id, productPromos: liveSessions.productPromos })
      .from(liveSessions)
      .where(
        and(
          eq(liveSessions.id, parsed.data.sessionId),
          eq(liveSessions.advisorId, authorization.data.id),
          isNull(liveSessions.endedAt),
        ),
      )
      .limit(1);
    if (!session) {
      return { ok: false as const, error: { code: "NOT_FOUND", message: "El live no existe." } };
    }

    // Se reemplaza la entrada del producto, nunca se acumulan dos para el mismo:
    // dos descuentos vigentes a la vez no se pueden resolver.
    const rest = session.productPromos.filter(
      (promo) => promo.product_id !== parsed.data.productId,
    );
    const productPromos =
      parsed.data.percent === null
        ? rest
        : [...rest, { product_id: parsed.data.productId, percent: parsed.data.percent }];

    const [updated] = await database
      .update(liveSessions)
      .set({ productPromos })
      .where(eq(liveSessions.id, session.id))
      .returning({ productPromos: liveSessions.productPromos });
    return { ok: true as const, data: updated ?? { productPromos } };
  } catch {
    return {
      ok: false as const,
      error: { code: "PROMO_FAILED", message: "No se pudo cambiar el precio especial." },
    };
  }
}

/** Descuento vigente de un producto en esta sesion, o nulo si no hay. */
export function promoPercentFor(
  productPromos: Array<{ product_id: string; percent: number }>,
  productId: string,
) {
  return productPromos.find((promo) => promo.product_id === productId)?.percent ?? null;
}
