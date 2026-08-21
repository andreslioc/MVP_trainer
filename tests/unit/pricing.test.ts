import { describe, expect, it } from "vitest";

import {
  coversIncentiveThreshold,
  DEFAULT_PROMO_PERCENT,
  formatCop,
  resolvePricing,
} from "../../src/lib/pricing.ts";

describe("precio especial", () => {
  it("no aplica descuento con el check apagado", () => {
    const pricing = resolvePricing({ priceCop: 189_000, promoActive: false, promoPercent: 15 });
    expect(pricing.promoPriceCop).toBeNull();
    expect(pricing.promoPercent).toBeNull();
  });

  it("aplica el descuento cuando el check esta activo", () => {
    const pricing = resolvePricing({ priceCop: 189_000, promoActive: true, promoPercent: 15 });
    // 189.000 menos 15% son 160.650, que al millar es 161.000.
    expect(pricing.promoPriceCop).toBe(161_000);
  });

  it("redondea al millar, que es como se dice un precio en un live", () => {
    expect(
      resolvePricing({ priceCop: 135_000, promoActive: true, promoPercent: 12 }).promoPriceCop,
    ).toBe(119_000);
  });

  it("sin precio no inventa uno", () => {
    const pricing = resolvePricing({ priceCop: null, promoActive: true, promoPercent: 20 });
    expect(pricing.priceCop).toBeNull();
    expect(pricing.promoPriceCop).toBeNull();
  });

  it("el descuento nunca sale mayor que el precio", () => {
    for (const percent of [1, 25, 50, 99]) {
      const pricing = resolvePricing({
        priceCop: 189_000,
        promoActive: true,
        promoPercent: percent,
      });
      expect(pricing.promoPriceCop).toBeLessThan(189_000);
      expect(pricing.promoPriceCop).toBeGreaterThan(0);
    }
  });

  it("se lee en el formato colombiano", () => {
    expect(formatCop(189_000)).toBe("$189.000");
    expect(formatCop(null)).toBeNull();
  });
});

describe("descuento por defecto del control del live", () => {
  it("es un escalon tipico de promocion", () => {
    expect(DEFAULT_PROMO_PERCENT).toBe(10);
  });

  it("cae dentro de lo que la base y el validador aceptan", () => {
    expect(DEFAULT_PROMO_PERCENT).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_PROMO_PERCENT).toBeLessThanOrEqual(99);
  });

  it("prender el check con el valor por defecto da un precio usable", () => {
    // Es lo que ve la asesora si activa y no toca nada: 189.000 menos 10%.
    const pricing = resolvePricing({
      priceCop: 189_000,
      promoActive: true,
      promoPercent: DEFAULT_PROMO_PERCENT,
    });
    expect(pricing.promoPriceCop).toBe(170_000);
  });
});

describe("umbral de un incentivo de compra", () => {
  const envioGratis = { threshold_cop: 120_000 };

  it("un producto de $170.000 ya lo pasa, asi que el envio no tiene condicion que recitar", () => {
    const pricing = resolvePricing({ priceCop: 189_000, promoActive: true, promoPercent: 10 });
    expect(coversIncentiveThreshold(pricing, envioGratis)).toBe(true);
  });

  it("se mide contra el precio especial, que es el que la clienta va a pagar", () => {
    // Caso limite: $130.000 de lista pasa el umbral, pero con el 20% del live
    // queda en $104.000 y ya no lo pasa. Decirle "envio gratis" ahi es
    // prometerle algo que la caja no le va a dar.
    const pricing = resolvePricing({ priceCop: 130_000, promoActive: true, promoPercent: 20 });
    expect(pricing.promoPriceCop).toBe(104_000);
    expect(coversIncentiveThreshold(pricing, envioGratis)).toBe(false);
  });

  it("sin precio en la ficha no se afirma nada", () => {
    const pricing = resolvePricing({ priceCop: null, promoActive: false, promoPercent: null });
    expect(coversIncentiveThreshold(pricing, envioGratis)).toBe(false);
  });

  it("un incentivo sin umbral no se da por cumplido", () => {
    const pricing = resolvePricing({ priceCop: 189_000, promoActive: false, promoPercent: null });
    expect(coversIncentiveThreshold(pricing, { message: "Promocion del live" })).toBe(false);
    expect(coversIncentiveThreshold(pricing, null)).toBe(false);
  });
});
