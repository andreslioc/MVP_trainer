import { asc, eq } from "drizzle-orm";

import { db } from "../db/client.ts";
import { commercialRules } from "../db/schema.ts";
import { type AdvisorRole, requireRole } from "../lib/auth.ts";
import {
  type CommercialRuleUpdate,
  commercialRuleValidationError,
  parseCommercialRuleUpdate,
} from "../lib/validation/commercial-rule.ts";

type RuleDatabase = Pick<typeof db, "select" | "update">;
type AuthorizationResult =
  | { ok: true; data: { role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };
type Authorize = (role: AdvisorRole) => Promise<AuthorizationResult>;

export type CommercialRuleDependencies = {
  database?: RuleDatabase;
  authorize?: Authorize;
};

function dependencies(options: CommercialRuleDependencies) {
  return {
    database: options.database ?? db,
    authorize: options.authorize ?? requireRole,
  };
}

export async function listCommercialRules(options: CommercialRuleDependencies = {}) {
  const { database, authorize } = dependencies(options);
  const authorization = await authorize("admin");
  if (!authorization.ok) return authorization;

  try {
    const rows = await database.select().from(commercialRules).orderBy(asc(commercialRules.key));
    return { ok: true as const, data: rows };
  } catch {
    return {
      ok: false as const,
      error: { code: "COMMERCIAL_RULE_LIST_FAILED", message: "No se pudieron cargar las reglas." },
    };
  }
}

export async function getActiveCommercialRules(options: CommercialRuleDependencies = {}) {
  const { database, authorize } = dependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;

  try {
    const rows = await database
      .select()
      .from(commercialRules)
      .where(eq(commercialRules.active, true))
      .orderBy(asc(commercialRules.key));
    return { ok: true as const, data: rows };
  } catch {
    return {
      ok: false as const,
      error: {
        code: "ACTIVE_RULE_LIST_FAILED",
        message: "No se pudieron cargar las reglas activas.",
      },
    };
  }
}

export async function updateCommercialRule(
  input: CommercialRuleUpdate,
  options: CommercialRuleDependencies = {},
) {
  const { database, authorize } = dependencies(options);
  const authorization = await authorize("admin");
  if (!authorization.ok) return authorization;

  const parsed = parseCommercialRuleUpdate(input);
  if (!parsed.success) {
    return { ok: false as const, error: commercialRuleValidationError(parsed.error) };
  }

  try {
    const [updated] = await database
      .update(commercialRules)
      .set({ value: parsed.data.value, active: parsed.data.active, updatedAt: new Date() })
      .where(eq(commercialRules.key, parsed.data.key))
      .returning();
    if (!updated) {
      return {
        ok: false as const,
        error: { code: "COMMERCIAL_RULE_NOT_FOUND", message: "La regla no existe." },
      };
    }
    return { ok: true as const, data: updated };
  } catch {
    return {
      ok: false as const,
      error: { code: "COMMERCIAL_RULE_UPDATE_FAILED", message: "No se pudo guardar la regla." },
    };
  }
}
