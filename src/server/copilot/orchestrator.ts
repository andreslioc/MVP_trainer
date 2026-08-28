export type AvailableCta = { text: string; ruleKey: string };
export type CommercialRule = {
  key: string;
  value: Record<string, unknown>;
  active: boolean;
};

export type CopilotOrchestrationInput = {
  availableCtas: AvailableCta[];
  rules: CommercialRule[];
  ctasUsed: Array<{ cta: string; at: string }>;
  promosMentioned: Array<{ rule_key: string; at: string }>;
  /** Intencion clasificada de la pregunta. Decide si el CTA puede rotar. */
  intent?: string;
};

/**
 * Intenciones de quien ya quiere comprar.
 *
 * Con estas la rotacion se suspende: alguien que pregunta el precio esta listo
 * para cerrar, y contestarle "sigue la cuenta para ver los proximos lives"
 * —que es lo que hacia la rotacion a ciegas— cambia una venta por un
 * seguidor.
 */
const BUY_READY_INTENTS = new Set(["precio", "compra"]);

/**
 * Un CTA cierra venta cuando su regla lo declara con `closes_sale`.
 *
 * Se lee de la regla y no de una lista de claves en el codigo porque las reglas
 * comerciales son configurables: manana alguien agrega un CTA de "pedido por la
 * web" y tiene que poder marcarlo como de cierre sin tocar este archivo.
 */
function closesSale(rules: CommercialRule[], ruleKey: string) {
  return rules.find((rule) => rule.key === ruleKey)?.value.closes_sale === true;
}

/**
 * Un CTA de ultimo recurso solo sale cuando no hay otro disponible.
 *
 * "Sigue la cuenta" despues de "que ingredientes tiene" no es un cierre: es
 * ruido pegado a una respuesta util. Se lee de la regla —`last_resort`— igual
 * que `closes_sale`, para que se configure sin tocar este archivo.
 */
function isLastResort(rules: CommercialRule[], ruleKey: string) {
  return rules.find((rule) => rule.key === ruleKey)?.value.last_resort === true;
}

const incentiveRuleKeys = new Set(["envio_gratis", "promo_live", "cupon_por_seguir"]);

/**
 * Un incentivo con umbral de compra es el que una respuesta de precio puede
 * resolver ahi mismo: la clienta acaba de escuchar el numero y ya sabe si lo
 * pasa. Se lee del valor de la regla —`threshold_cop`— y no de una lista de
 * claves, igual que `closes_sale`.
 */
function hasPurchaseThreshold(rule: CommercialRule) {
  return typeof rule.value.threshold_cop === "number";
}

function chooseWithoutImmediateRepeat<T>(items: T[], previous: T | undefined) {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0] ?? null;
  return items.find((item) => item !== previous) ?? items[0] ?? null;
}

export function orchestrateCopilot(input: CopilotOrchestrationInput) {
  const activeRules = input.rules.filter((rule) => rule.active);
  const activeRuleKeys = new Set(activeRules.map((rule) => rule.key));
  const availableCtas = input.availableCtas.filter(
    (candidate) => candidate.text.trim() && activeRuleKeys.has(candidate.ruleKey),
  );
  // Con intencion de compra se prefiere un CTA de cierre y NO se rota: repetir
  // "escribenos y te lo apartamos" dos veces seguidas es correcto cuando dos
  // clientas seguidas preguntan el precio.
  const closing = BUY_READY_INTENTS.has(input.intent ?? "")
    ? availableCtas.filter((candidate) => closesSale(input.rules, candidate.ruleKey))
    : [];
  const preferred = availableCtas.filter(
    (candidate) => !isLastResort(input.rules, candidate.ruleKey),
  );
  const rotatable = preferred.length > 0 ? preferred : availableCtas;
  const previousCta = input.ctasUsed.at(-1)?.cta;
  const ctaText =
    closing.length > 0
      ? (closing[0]?.text ?? null)
      : chooseWithoutImmediateRepeat(
          rotatable.map((candidate) => candidate.text),
          previousCta,
        );
  const cta = ctaText
    ? (availableCtas.find((candidate) => candidate.text === ctaText) ?? null)
    : null;

  const incentives = activeRules.filter((rule) => incentiveRuleKeys.has(rule.key));
  // Con intencion de precio o de compra el incentivo tampoco rota: el envio
  // gratis por monto es el unico que se puede decir junto al precio, y rotarlo
  // a un cupon sin configurar deja la respuesta de precio sin nada que sumar.
  const thresholdIncentives = BUY_READY_INTENTS.has(input.intent ?? "")
    ? incentives.filter(hasPurchaseThreshold)
    : [];
  const previousPromotion = input.promosMentioned.at(-1)?.rule_key;
  const incentiveKey =
    thresholdIncentives.length > 0
      ? (thresholdIncentives[0]?.key ?? null)
      : chooseWithoutImmediateRepeat(
          incentives.map((rule) => rule.key),
          previousPromotion,
        );
  const incentive = incentiveKey
    ? (incentives.find((rule) => rule.key === incentiveKey) ?? null)
    : null;

  return {
    cta,
    incentive: incentive ? { ruleKey: incentive.key, value: incentive.value } : null,
    ruleApplied: incentive?.key ?? cta?.ruleKey ?? null,
  };
}

export function availableCtasFromRules(rules: CommercialRule[]) {
  return rules.flatMap((rule) => {
    const cta = rule.value.cta;
    return typeof cta === "string" && cta.trim() ? [{ text: cta.trim(), ruleKey: rule.key }] : [];
  });
}
