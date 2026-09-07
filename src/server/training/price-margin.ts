import { and, eq } from "drizzle-orm";

import type { db } from "../../db/client.ts";
import { commercialRules } from "../../db/schema.ts";
import {
  formatCop,
  priceMarginFromRule,
  priceToleranceRange,
  resolvePricing,
} from "../../lib/pricing.ts";

/**
 * El margen con el que el evaluador juzga un precio.
 *
 * Existe porque el evaluador penalizaba a la asesora por decir el precio que
 * tenia en pantalla: en un live de TikTok el precio baja cuando se enciende una
 * oferta y sube cuando se acaba, y el que ella dice es el correcto para esa
 * clienta en ese momento aunque no sea el de la ficha.
 *
 * Partido en dos a proposito. Leer la regla toca la base; formatear el rango es
 * puro. El simulacro evalua sus respuestas en paralelo, asi que lee el margen
 * UNA vez y formatea por producto sin volver a consultar.
 */
type MarginReader = Pick<typeof db, "select">;

export async function readPriceMargin(database: MarginReader) {
  const [rule] = await database
    .select({ value: commercialRules.value })
    .from(commercialRules)
    .where(and(eq(commercialRules.key, "margen_precio"), eq(commercialRules.active, true)))
    .limit(1);
  // Sin la regla cargada cae al margen por defecto: quedarse sin margen
  // devuelve al evaluador al comportamiento que estamos arreglando.
  return priceMarginFromRule((rule?.value ?? null) as Record<string, unknown> | null);
}

/**
 * El rango ya escrito, listo para el prompt. Nulo cuando la ficha no tiene
 * precio: sin precio no hay nada que tolerar y el bloque no se escribe.
 *
 * Se mide contra el precio de lista porque el simulacro no tiene live encendido:
 * aqui no hay precio especial que pueda estar activo.
 */
export function formatAcceptedPriceRange(priceCop: number | null, marginCop: number) {
  if (priceCop === null) return null;
  const range = priceToleranceRange(
    resolvePricing({ priceCop, promoActive: false, promoPercent: null }),
    marginCop,
  );
  if (!range) return null;
  return { min: formatCop(range.minCop) ?? "", max: formatCop(range.maxCop) ?? "" };
}
