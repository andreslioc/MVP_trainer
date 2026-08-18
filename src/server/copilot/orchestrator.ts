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
};

const incentiveRuleKeys = new Set(["envio_gratis", "promo_live", "cupon_por_seguir"]);

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
  const previousCta = input.ctasUsed.at(-1)?.cta;
  const ctaText = chooseWithoutImmediateRepeat(
    availableCtas.map((candidate) => candidate.text),
    previousCta,
  );
  const cta = ctaText
    ? (availableCtas.find((candidate) => candidate.text === ctaText) ?? null)
    : null;

  const incentives = activeRules.filter((rule) => incentiveRuleKeys.has(rule.key));
  const previousPromotion = input.promosMentioned.at(-1)?.rule_key;
  const incentiveKey = chooseWithoutImmediateRepeat(
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
