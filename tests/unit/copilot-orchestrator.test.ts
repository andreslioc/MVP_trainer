import { describe, expect, it } from "vitest";

import {
  availableCtasFromRules,
  orchestrateCopilot,
  type CommercialRule,
} from "../../src/server/copilot/orchestrator.ts";

const activeRules: CommercialRule[] = [
  { key: "canal_whatsapp", value: { cta: "Escríbenos por WhatsApp" }, active: true },
  { key: "seguir_tiktok", value: { cta: "Sigue nuestra cuenta" }, active: true },
  { key: "envio_gratis", value: { threshold_cop: 120_000 }, active: true },
  { key: "promo_live", value: { message: "Promoción inactiva" }, active: false },
];

describe("Copilot commercial orchestrator", () => {
  it("rotates away from the immediately previous CTA when an alternative exists", () => {
    const result = orchestrateCopilot({
      availableCtas: availableCtasFromRules(activeRules),
      rules: activeRules,
      ctasUsed: [{ cta: "Escríbenos por WhatsApp", at: "2026-08-18T12:00:00Z" }],
      promosMentioned: [],
    });

    expect(result.cta).toEqual({ text: "Sigue nuestra cuenta", ruleKey: "seguir_tiktok" });
  });

  it("repeats the only valid CTA and never creates a replacement", () => {
    const oneRule = activeRules.filter((rule) => rule.key === "canal_whatsapp");
    const result = orchestrateCopilot({
      availableCtas: availableCtasFromRules(oneRule),
      rules: oneRule,
      ctasUsed: [{ cta: "Escríbenos por WhatsApp", at: "2026-08-18T12:00:00Z" }],
      promosMentioned: [],
    });

    expect(result.cta?.text).toBe("Escríbenos por WhatsApp");
    expect(result.cta?.ruleKey).toBe("canal_whatsapp");
  });

  it("returns at most one CTA and one active incentive", () => {
    const result = orchestrateCopilot({
      availableCtas: availableCtasFromRules(activeRules),
      rules: activeRules,
      ctasUsed: [],
      promosMentioned: [],
    });

    expect(result.cta).toEqual({ text: "Escríbenos por WhatsApp", ruleKey: "canal_whatsapp" });
    expect(result.incentive).toEqual({
      ruleKey: "envio_gratis",
      value: { threshold_cop: 120_000 },
    });
    expect(result.incentive?.ruleKey).not.toBe("promo_live");
  });

  it("rotates an incentive when another active option exists", () => {
    const rules = activeRules.map((rule) =>
      rule.key === "promo_live" ? { ...rule, active: true } : rule,
    );
    const result = orchestrateCopilot({
      availableCtas: availableCtasFromRules(rules),
      rules,
      ctasUsed: [],
      promosMentioned: [{ rule_key: "envio_gratis", at: "2026-08-18T12:00:00Z" }],
    });

    expect(result.incentive?.ruleKey).toBe("promo_live");
  });

  it("returns null instead of inventing a CTA or promotion", () => {
    const result = orchestrateCopilot({
      availableCtas: [{ text: "CTA de regla apagada", ruleKey: "apagada" }],
      rules: [{ key: "apagada", value: { cta: "CTA de regla apagada" }, active: false }],
      ctasUsed: [],
      promosMentioned: [],
    });

    expect(result).toEqual({ cta: null, incentive: null, ruleApplied: null });
  });
});
