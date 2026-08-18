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
        .select({ id: products.id, name: products.name, brand: products.brand })
        .from(products)
        .where(isNotNull(products.verifiedAt))
        .orderBy(asc(products.name)),
      database
        .select({ key: commercialRules.key, value: commercialRules.value })
        .from(commercialRules)
        .where(eq(commercialRules.active, true))
        .orderBy(asc(commercialRules.key)),
      database
        .select({ id: liveSessions.id, startedAt: liveSessions.startedAt })
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
