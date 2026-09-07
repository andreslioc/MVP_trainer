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

/**
 * Cuanto se puede mover el precio en un live sin que sea un dato equivocado.
 *
 * En TikTok Live el precio NO se queda quieto: baja por una oferta que se
 * enciende a mitad de transmision, sube cuando se acaba. La asesora dice el que
 * ve en pantalla, y el evaluador del simulacro lo comparaba contra la ficha y lo
 * marcaba como dato inventado. Dentro de este margen es un precio VALIDO para
 * ese producto, no un error: bajo por una promocion, que es lo normal.
 *
 * El valor por defecto existe para que el evaluador no se quede sin margen si la
 * regla no esta cargada. El que manda es `commercial_rules`, key `margen_precio`,
 * porque cuanto se mueve un precio en un live lo decide el negocio y cambia sin
 * que nadie despliegue nada.
 */
export const DEFAULT_PRICE_MARGIN_COP = 20_000;

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

/**
 * El rango de precios que cuentan como correctos para este producto.
 *
 * Se resuelve aqui y no en el prompt por lo mismo que el descuento: una resta
 * de 87.000 menos 20.000 el modelo la falla de vez en cuando, y el evaluador
 * penalizaria a la asesora por un numero que si era valido. Al prompt le llegan
 * los dos extremos ya escritos.
 *
 * Se mide contra el precio VIGENTE —el especial cuando esta activo—, que es el
 * que la asesora tiene en pantalla y por tanto el que va a decir.
 */
export function priceToleranceRange(
  pricing: Pricing,
  marginCop: number = DEFAULT_PRICE_MARGIN_COP,
) {
  const current = pricing.promoPriceCop ?? pricing.priceCop;
  if (current === null) return null;
  // El piso es cero: un margen mayor que el precio no convierte el rango en
  // negativo, que es una frase absurda en camara.
  const minCop = Math.max(0, current - marginCop);
  return { minCop, maxCop: current + marginCop, marginCop, currentCop: current };
}

/** Lee el margen de la regla comercial. Sin regla, el de por defecto. */
export function priceMarginFromRule(ruleValue: Record<string, unknown> | null) {
  const margin = ruleValue?.margin_cop;
  return typeof margin === "number" && margin >= 0 ? margin : DEFAULT_PRICE_MARGIN_COP;
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
  /**
   * Margen del live. Se descuenta del precio ANTES de comparar, asi que el
   * envio gratis solo se afirma cuando el producto alcanza el umbral incluso en
   * su precio mas bajo.
   *
   * Un producto de $130.000 contra un umbral de $120.000 lo alcanza hoy, y deja
   * de alcanzarlo si en el live baja a $110.000 — pero la asesora ya lo dijo en
   * camara. Prometer envio gratis y no cumplirlo cuesta mas que no prometerlo:
   * la clienta ya decidio comprar con esa cuenta hecha.
   */
  marginCop = 0,
) {
  const threshold = incentiveValue?.threshold_cop;
  if (typeof threshold !== "number") return false;
  const current = pricing.promoPriceCop ?? pricing.priceCop;
  if (current === null) return false;
  return Math.max(0, current - marginCop) >= threshold;
}
