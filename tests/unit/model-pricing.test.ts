import { describe, expect, it } from "vitest";

import { MODEL_PRICING_USD_PER_MTOK } from "../../src/lib/ai/config.ts";
import { calculateCostUsd } from "../../src/lib/ai/gateway.ts";

/**
 * Guarda de regresion sobre los precios de lista. Un digito mal puesto aqui no
 * rompe nada visible: el producto sigue funcionando y el ledger reporta una
 * cifra equivocada durante meses. Se fijan los del modelo por defecto y se
 * verifica que el calculo los aplique.
 */
describe("tabla de precios", () => {
  it("mantiene los precios publicados del modelo por defecto", () => {
    expect(MODEL_PRICING_USD_PER_MTOK["gemini-3.1-flash-lite"]).toEqual({
      input: 0.25,
      output: 1.5,
      cacheRead: 0.025,
      cacheWrite: 0,
    });
  });

  it("cobra la salida mas cara que la entrada en todos los modelos", () => {
    for (const [model, pricing] of Object.entries(MODEL_PRICING_USD_PER_MTOK)) {
      expect(pricing.output, model).toBeGreaterThan(pricing.input);
      expect(pricing.cacheRead, model).toBeLessThan(pricing.input);
    }
  });

  it("no cobra escritura de cache: el proveedor no la reporta", () => {
    for (const [model, pricing] of Object.entries(MODEL_PRICING_USD_PER_MTOK)) {
      expect(pricing.cacheWrite, model).toBe(0);
    }
  });

  it("calcula el costo de una llamada real del Copilot", () => {
    // Consumo medido de copilot_compose: 846 entrada / 344 salida.
    const cost = calculateCostUsd(
      { inputTokens: 846, outputTokens: 344, cacheReadTokens: 0, cacheWriteTokens: 0 },
      MODEL_PRICING_USD_PER_MTOK["gemini-3.1-flash-lite"],
    );

    expect(cost).toBeCloseTo((846 * 0.25 + 344 * 1.5) / 1_000_000, 12);
    expect(cost).toBeGreaterThan(0);
  });

  it("deja de reportar cero ahora que el despliegue puede ser de pago", () => {
    const gratis = Object.values(MODEL_PRICING_USD_PER_MTOK).filter(
      (pricing) => pricing.input === 0 && pricing.output === 0,
    );

    expect(gratis).toHaveLength(0);
  });
});
