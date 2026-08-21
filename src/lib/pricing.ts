/**
 * Precio de un producto y su precio especial.
 *
 * Vive en `lib/` y es puro por una razon concreta: el descuento NO lo calcula
 * el modelo. Un 189.000 por 0,85 lo falla de vez en cuando, y un precio mal
 * dicho en camara no es un bug que se note en un log — lo escucha la clienta.
 * Aqui se resuelve el numero final y al prompt le llegan las dos cifras ya
 * hechas, con la instruccion de copiarlas tal cual.
 */

/**
 * Descuento con el que arranca el control del live.
 *
 * Diez es el escalon mas comun de una promocion de live y deja el campo listo
 * para prender el check de un clic. No es un valor guardado: hasta que la
 * asesora no activa el precio especial, no existe ningun descuento.
 */
export const DEFAULT_PROMO_PERCENT = 10;

export type PricingInput = {
  priceCop: number | null;
  promoActive: boolean;
  promoPercent: number | null;
};

export type Pricing = {
  /** Precio de lista. Nulo cuando la ficha todavia no lo tiene. */
  priceCop: number | null;
  /** Precio con descuento aplicado, o nulo si no hay precio especial activo. */
  promoPriceCop: number | null;
  promoPercent: number | null;
};

/**
 * Los precios en Colombia se dicen al millar. Un 189.000 con 15% da 160.650, y
 * nadie dice "ciento sesenta mil seiscientos cincuenta" en un live: se dice
 * ciento sesenta y un mil. Redondear aqui evita que la asesora improvise el
 * redondeo en camara y termine diciendo un numero distinto cada vez.
 */
function roundToThousand(value: number) {
  return Math.round(value / 1000) * 1000;
}

export function resolvePricing(product: PricingInput): Pricing {
  const { priceCop, promoActive, promoPercent } = product;
  if (priceCop === null || !promoActive || promoPercent === null) {
    return { priceCop, promoPriceCop: null, promoPercent: null };
  }
  return {
    priceCop,
    promoPriceCop: roundToThousand(priceCop * (1 - promoPercent / 100)),
    promoPercent,
  };
}

/** `135000` → `"$135.000"`, en el formato que se lee en Colombia. */
export function formatCop(value: number | null) {
  if (value === null) return null;
  return `$${value.toLocaleString("es-CO")}`;
}

/**
 * El producto, por si solo, ya alcanza el umbral de compra del incentivo.
 *
 * Lo resuelve el codigo y no el modelo: comparar $170.000 con $120.000 es
 * trivial, pero de la comparacion depende como se dice el envio en camara, y un
 * "en compras desde $120.000" pegado a un producto de $170.000 le hace pensar a
 * la clienta que todavia le falta para alcanzarlo.
 *
 * Se mide contra el precio vigente —el especial cuando esta activo, el de lista
 * cuando no—, que es el que la clienta va a pagar.
 */
export function coversIncentiveThreshold(
  pricing: Pricing,
  incentiveValue: Record<string, unknown> | null,
) {
  const threshold = incentiveValue?.threshold_cop;
  if (typeof threshold !== "number") return false;
  const current = pricing.promoPriceCop ?? pricing.priceCop;
  return current !== null && current >= threshold;
}
