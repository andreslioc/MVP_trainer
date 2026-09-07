import { describe, expect, it } from "vitest";

import { buildEvaluateAnswerPrompt } from "../../src/lib/ai/prompts/evaluate-answer.ts";
import {
  DEFAULT_PRICE_MARGIN_COP,
  coversIncentiveThreshold,
  priceMarginFromRule,
  priceToleranceRange,
  resolvePricing,
} from "../../src/lib/pricing.ts";
import { formatAcceptedPriceRange } from "../../src/server/training/price-margin.ts";

/**
 * El precio de un live se mueve, y el evaluador penalizaba a la asesora por
 * decir el que tenia en pantalla.
 *
 * El margen se resuelve en codigo y no en el prompt por lo mismo que el
 * descuento: una resta mal hecha por el modelo aqui cuesta una nota injusta.
 */
const deLista = resolvePricing({ priceCop: 87_000, promoActive: false, promoPercent: null });

describe("rango de tolerancia del precio", () => {
  it("abre el rango a los dos lados: el precio sube y baja en un live", () => {
    const rango = priceToleranceRange(deLista, 20_000);

    expect(rango).toEqual({
      minCop: 67_000,
      maxCop: 107_000,
      marginCop: 20_000,
      currentCop: 87_000,
    });
  });

  it("no baja de cero cuando el margen es mayor que el precio", () => {
    const barato = resolvePricing({ priceCop: 8_000, promoActive: false, promoPercent: null });
    expect(priceToleranceRange(barato, 20_000)?.minCop).toBe(0);
  });

  it("se mide contra el precio VIGENTE, que es el que la asesora ve en pantalla", () => {
    const conPromo = resolvePricing({ priceCop: 100_000, promoActive: true, promoPercent: 10 });
    const rango = priceToleranceRange(conPromo, 20_000);

    // 90.000 y no 100.000: con precio especial encendido, el de lista ya no es
    // el que ella dice.
    expect(rango?.currentCop).toBe(90_000);
    expect(rango?.minCop).toBe(70_000);
  });

  it("sin precio no hay rango", () => {
    const sinPrecio = resolvePricing({ priceCop: null, promoActive: false, promoPercent: null });
    expect(priceToleranceRange(sinPrecio, 20_000)).toBeNull();
  });
});

describe("el margen sale de la regla comercial", () => {
  it("lee el valor de la regla", () => {
    expect(priceMarginFromRule({ margin_cop: 15_000 })).toBe(15_000);
  });

  it("cae al de por defecto sin regla, con la regla vacia o con basura", () => {
    // Quedarse sin margen devuelve al evaluador al comportamiento que penalizaba
    // a la asesora, asi que el respaldo importa.
    expect(priceMarginFromRule(null)).toBe(DEFAULT_PRICE_MARGIN_COP);
    expect(priceMarginFromRule({})).toBe(DEFAULT_PRICE_MARGIN_COP);
    expect(priceMarginFromRule({ margin_cop: "20000" })).toBe(DEFAULT_PRICE_MARGIN_COP);
    expect(priceMarginFromRule({ margin_cop: -5 })).toBe(DEFAULT_PRICE_MARGIN_COP);
  });

  it("un margen de cero es una decision valida, no un valor ausente", () => {
    expect(priceMarginFromRule({ margin_cop: 0 })).toBe(0);
  });
});

describe("el umbral del incentivo se mide en el peor caso", () => {
  const envio = { threshold_cop: 120_000 };

  it("no promete envio gratis si el precio puede caer por debajo del umbral", () => {
    const cerca = resolvePricing({ priceCop: 130_000, promoActive: false, promoPercent: null });

    // Hoy alcanza los 120.000; si baja 20.000 en el live, no. Y la asesora ya
    // lo dijo en camara.
    expect(coversIncentiveThreshold(cerca, envio, 0)).toBe(true);
    expect(coversIncentiveThreshold(cerca, envio, 20_000)).toBe(false);
  });

  it("si lo promete cuando alcanza el umbral incluso en su precio mas bajo", () => {
    const holgado = resolvePricing({ priceCop: 145_000, promoActive: false, promoPercent: null });
    expect(coversIncentiveThreshold(holgado, envio, 20_000)).toBe(true);
  });
});

describe("el rango llega al prompt del evaluador ya escrito", () => {
  const ficha = {
    id: "1",
    sku: null,
    name: "Ashwagandha",
    brand: "Horbäach",
    presentation: "120 cápsulas",
    priceCop: 87_000,
  } as unknown as Parameters<typeof buildEvaluateAnswerPrompt>[0]["product"];

  const pregunta = { text: "¿cuánto cuesta?", idealAnswer: "$87.000", criteria: ["precio"] };

  it("escribe el bloque con los dos extremos, para que el modelo no reste", () => {
    const prompt = buildEvaluateAnswerPrompt({
      product: ficha,
      question: pregunta,
      advisorAnswer: "Está en $70.000",
      priceRange: formatAcceptedPriceRange(87_000, 20_000),
    });

    expect(prompt.system).toContain("RANGO DE PRECIO ACEPTABLE: entre $67.000 y $107.000");
    expect(prompt.system).toContain("EL PRECIO ES LA EXCEPCION");
  });

  it("sin precio en la ficha, el bloque no se escribe", () => {
    const prompt = buildEvaluateAnswerPrompt({
      product: ficha,
      question: pregunta,
      advisorAnswer: "No tengo el precio",
      priceRange: formatAcceptedPriceRange(null, 20_000),
    });

    // La regla del prompt NOMBRA el bloque para explicar como leerlo, asi que
    // el texto suelto siempre esta. Lo que no debe estar es el bloque con sus
    // cifras, que es lo unico que el modelo lee como dato.
    expect(prompt.system).not.toContain("RANGO DE PRECIO ACEPTABLE: entre");
  });
});
