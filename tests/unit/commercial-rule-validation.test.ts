import { describe, expect, it } from "vitest";

import {
  commercialRuleValidationError,
  parseCommercialRuleUpdate,
} from "../../src/lib/validation/commercial-rule.ts";

const validRules = [
  { key: "originalidad", value: { message: "Producto importado" }, active: true },
  { key: "envio_gratis", value: { threshold_cop: 150000 }, active: true },
  { key: "promo_live", value: { message: "Promoción vigente" }, active: false },
  { key: "seguir_tiktok", value: { cta: "Sigue la cuenta" }, active: true },
  { key: "canal_whatsapp", value: { cta: "Consulta disponibilidad" }, active: true },
  { key: "cupon_por_seguir", value: { message: "Cupón vigente" }, active: false },
] as const;

describe("commercial rule validation", () => {
  it.each(validRules)("accepts the stable $key shape", (rule) => {
    expect(parseCommercialRuleUpdate(rule).success).toBe(true);
  });

  it("rejects unknown keys", () => {
    const result = parseCommercialRuleUpdate({
      key: "regla_inventada" as "envio_gratis",
      value: { threshold_cop: 1 },
      active: true,
    });

    expect(result.success).toBe(false);
  });

  it("requires a positive integer shipping threshold", () => {
    const result = parseCommercialRuleUpdate({
      key: "envio_gratis",
      value: { threshold_cop: -1 },
      active: true,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(commercialRuleValidationError(result.error)).toMatchObject({
      code: "INVALID_COMMERCIAL_RULE",
      field: "value",
    });
  });

  it("does not accept a message where a CTA is required", () => {
    const result = parseCommercialRuleUpdate({
      key: "seguir_tiktok",
      value: { message: "Forma incorrecta" },
      active: true,
    });

    expect(result.success).toBe(false);
  });
});
