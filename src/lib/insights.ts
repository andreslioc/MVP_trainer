/**
 * Reglas de promocion de hallazgos, sin dependencias de base de datos.
 *
 * Vive en `lib/` y no en `server/` a proposito: la pantalla de Live
 * Intelligence necesita la misma regla para decidir si dibuja el boton, y un
 * componente cliente no puede importar `server/` porque arrastraria el cliente
 * de base de datos al navegador. Una sola definicion, dos consumidores.
 */

export type InsightType =
  | "faq"
  | "objecion"
  | "error"
  | "oportunidad"
  | "buena_practica"
  | "riesgo_claim";

/**
 * Solo estos dos tipos se convierten en material de practica. Un `error` o un
 * `riesgo_claim` describe algo que la asesora hizo mal: es senal para revisar la
 * ficha o el gate de comunicacion responsable, no una pregunta de cliente.
 */
export const PROMOTABLE_TYPES = new Set<InsightType>(["faq", "objecion"]);

export const INTENT_BY_PROMOTABLE_TYPE = Object.freeze({
  faq: "informacion",
  objecion: "objecion",
} as const);

export function isPromotable(insight: { type: string; productId: string | null }) {
  return PROMOTABLE_TYPES.has(insight.type as InsightType) && Boolean(insight.productId);
}

/** Por que un hallazgo no se puede promover, en palabras para la asesora. */
export function notPromotableReason(insight: { type: string; productId: string | null }) {
  if (!PROMOTABLE_TYPES.has(insight.type as InsightType)) {
    return "Este tipo de hallazgo no se convierte en pregunta de práctica.";
  }
  if (!insight.productId) return "Asocia un producto para poder promoverlo.";
  return null;
}
