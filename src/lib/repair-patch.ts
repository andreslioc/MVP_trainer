/**
 * Aplica una correccion dirigida sobre el parche de la ficha.
 *
 * Vive aparte del orquestador por una razon practica: es la unica parte del
 * bucle de reparacion que se puede probar sin un proveedor de IA, y es donde
 * esta el riesgo real —una correccion que en vez de arreglar un campo borra los
 * demas—. Solo se copian las claves que el modelo devolvio; una clave ausente
 * deja el valor investigado intacto.
 */

import type { RepairedCard } from "./ai/schemas.ts";

type Patch = Record<string, unknown>;

/**
 * Nombres del esquema de reparacion —snake_case, como los ve el modelo— a los
 * de la ficha. La traduccion es explicita y no automatica: un renombrado
 * silencioso escribiria un campo que nadie valida.
 */
const FIELD_NAMES: Record<keyof RepairedCard, string> = {
  description: "description",
  purpose: "purpose",
  audience: "audience",
  usage_mode: "usageMode",
  precautions: "precautions",
  advisor_summary: "advisorSummary",
  live_ready: "liveReady",
  contraindications: "contraindications",
  claims_allowed: "claimsAllowed",
  keywords: "keywords",
  benefits: "benefits",
  faqs: "faqs",
  objections: "objections",
  differentiators: "differentiators",
  vs_similares: "vsSimilares",
};

export function applyRepair(patch: Patch, repair: RepairedCard): Patch {
  const result: Patch = { ...patch };
  for (const [key, target] of Object.entries(FIELD_NAMES) as Array<[keyof RepairedCard, string]>) {
    const value = repair[key];
    if (value === undefined) continue;
    // Un arreglo vacio no es una correccion: es una perdida. El modelo que
    // "arregla" los casos de no uso borrandolos deja la ficha sin advertencias.
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    result[target] = value;
  }
  return result;
}

/**
 * Los campos que el modelo puede tocar. Se usa para decirle en el error cuales
 * son reparables: un rechazo por un campo fuera de esta lista no tiene sentido
 * mandarlo a reparar.
 */
export const REPAIRABLE_FIELDS = new Set(Object.values(FIELD_NAMES));

export function isRepairable(issuePaths: readonly string[]): boolean {
  return issuePaths.every((path) => REPAIRABLE_FIELDS.has(path.split(".")[0] ?? path));
}
