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

/**
 * El margen del precio del live, editable desde Ajustes.
 *
 * Su esquema se separa del umbral del envio por un caso concreto: el cero. En el
 * umbral, cero no significa nada —un envio gratis "desde $0" es un campo sin
 * llenar—; en el margen es una decision deliberada: solo el precio de la ficha
 * cuenta como correcto.
 */
describe("margen del precio", () => {
  it("acepta el margen en pesos", () => {
    const result = parseCommercialRuleUpdate({
      key: "margen_precio",
      value: { margin_cop: 20_000 },
      active: true,
    });

    expect(result.success).toBe(true);
  });

  it("acepta CERO, que es distinto de vacio", () => {
    const result = parseCommercialRuleUpdate({
      key: "margen_precio",
      value: { margin_cop: 0 },
      active: true,
    });

    expect(result.success).toBe(true);
  });

  it("rechaza un margen negativo", () => {
    const result = parseCommercialRuleUpdate({
      key: "margen_precio",
      value: { margin_cop: -1000 },
      active: true,
    });

    expect(result.success).toBe(false);
  });

  it("rechaza un margen que no distingue nada", () => {
    const result = parseCommercialRuleUpdate({
      key: "margen_precio",
      value: { margin_cop: 5_000_000 },
      active: true,
    });

    expect(result.success).toBe(false);
  });

  it("rechaza el numero escrito como texto", () => {
    // El editor lo convierte con Number() antes de guardar; si eso se rompe, el
    // borde tiene que atraparlo y no guardar un margen que nadie puede leer.
    const result = parseCommercialRuleUpdate({
      key: "margen_precio",
      value: { margin_cop: "20000" },
      active: true,
    });

    expect(result.success).toBe(false);
  });

  it("rechaza una llave que el esquema del margen no declara", () => {
    const result = parseCommercialRuleUpdate({
      key: "margen_precio",
      value: { margin_cop: 20_000, message: "de contrabando" },
      active: true,
    });

    expect(result.success).toBe(false);
  });
});
