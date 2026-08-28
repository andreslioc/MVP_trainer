import { describe, expect, it } from "vitest";

import type { products } from "../../src/db/schema.ts";
import type { CopilotComposition } from "../../src/lib/ai/schemas.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import { applyResponsibleCommunication } from "../../src/server/copilot/responsible.ts";
import { validProductInput } from "../fixtures/product.ts";

function product(
  overrides: Partial<typeof products.$inferSelect> = {},
): typeof products.$inferSelect {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    ...productInputSchema.parse(
      validProductInput({ verifiedAt: new Date("2026-01-01T00:00:00.000Z") }),
    ),
    sku: null,
    imageUrl: null,
    verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function composition(overrides: Partial<CopilotComposition> = {}): CopilotComposition {
  return {
    intent: "informacion",
    express: "Complementa la ingesta de magnesio.",
    estandar: "Complementa la ingesta de magnesio según su etiqueta.",
    profunda: "Complementa la ingesta de magnesio según la ficha verificada del producto.",
    confidence: "alto",
    cta_used: null,
    rule_applied: null,
    ...overrides,
  };
}

describe("comunicación responsable", () => {
  // Las tres primeras frases salieron literales del Copilot corriendo contra la
  // ficha del Thermogenic Fat Burner del catalogo: antes de este gate pasaban
  // sin una sola alerta.
  it.each([
    "Este suplemento apoya tu metabolismo y control de apetito, ayudándote en tu déficit calórico.",
    "Te ayuda a controlar el apetito para mantener tu déficit calórico, que es lo que permite la pérdida de peso.",
    "Facilita el mantenimiento de un déficit calórico, el factor determinante para la pérdida de peso.",
    "Te ayuda a quemar grasa abdominal.",
    "Con esto bajas de peso más rápido.",
    "Ideal para ganar músculo en poco tiempo.",
  ])("bloquea una afirmación de peso o composición corporal: %s", (express) => {
    const result = applyResponsibleCommunication({
      question: "¿sirve para bajar de peso?",
      composition: composition({ express }),
      product: product(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.alerts[0]?.code).toBe("BODY_TRANSFORMATION_CLAIM");
  });

  it.each([
    "Te garantizamos calidad en cada gota.",
    "Es el mejor del mercado.",
    "Es 100% original.",
    "Es más efectivo que las cápsulas.",
  ])("bloquea calidad o superioridad que nadie puede demostrar: %s", (express) => {
    const result = applyResponsibleCommunication({
      question: "¿es bueno?",
      composition: composition({ express }),
      product: product(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.alerts[0]?.code).toBe("UNVERIFIABLE_QUALITY_CLAIM");
  });

  it("en modo enseñanza no sustituye la respuesta por la frase de cautela", () => {
    // La version mejorada del Simulator tiene que ENSENAR a responder una
    // pregunta de riesgo, no recitar la frase enlatada.
    const buena =
      "La etiqueta dice expresamente que no es para embarazadas ni en lactancia, así que no. Consúltalo con tu médico.";
    const result = applyResponsibleCommunication({
      question: "¿puedo tomarlo si estoy embarazada?",
      composition: composition({ express: buena }),
      product: product(),
      mode: "teaching",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.composition.express).toBe(buena);
  });

  it("en modo enseñanza sigue bloqueando una afirmación prohibida", () => {
    const result = applyResponsibleCommunication({
      question: "¿puedo tomarlo si estoy embarazada?",
      composition: composition({ express: "Sí, cura la infección sin problema." }),
      product: product(),
      mode: "teaching",
    });
    expect(result.ok).toBe(false);
  });

  it("alerta —sin bloquear— cuando la respuesta habla como etiqueta", () => {
    const result = applyResponsibleCommunication({
      question: "¿qué tiene?",
      composition: composition({
        express: "Contiene aceite de oliva como vehículo para diluirlo.",
      }),
      product: product(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const alert = result.data.alerts.find((item) => item.code === "JARGON_IN_ANSWER");
    expect(alert).toBeDefined();
    // Dice en cual de las tres vistas esta, o la asesora regenera una respuesta
    // que se ve bien porque la palabra vivia en otra.
    expect(alert?.message).toContain("vista express");
  });

  it("alerta —sin bloquear— cuando la respuesta promete variedad sin nombrarla", () => {
    const result = applyResponsibleCommunication({
      question: "¿para qué sirve?",
      composition: composition({ express: "Sirve para diversos objetivos de salud." }),
      product: product(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.alerts.some((alert) => alert.code === "VAGUE_ANSWER")).toBe(true);
  });

  it.each([
    "Resultados garantizados en dos semanas.",
    "Es 100% efectivo.",
    "Te va a funcionar.",
    "Tiene un efecto milagroso.",
  ])("bloquea una promesa de resultado: %s", (express) => {
    const result = applyResponsibleCommunication({
      question: "¿en cuánto tiempo funciona?",
      composition: composition({ express }),
      product: product(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.alerts[0]?.code).toBe("GUARANTEED_RESULT_CLAIM");
  });

  it.each([
    "Es un quemador de grasa termogénico en cápsulas.",
    "Se toma una cápsula con el desayuno y abundante agua.",
    "Los resultados pueden variar según cada persona y el uso del producto.",
  ])("deja pasar el hecho de la etiqueta y la respuesta prudente: %s", (express) => {
    const result = applyResponsibleCommunication({
      question: "¿qué es este producto?",
      composition: composition({ express }),
      product: product(),
    });
    expect(result.ok).toBe(true);
  });

  it.each([
    "¿Puedo usarlo durante el embarazo?",
    "¿Es adecuado durante la lactancia?",
    "¿Puedo tomarlo con un medicamento?",
    "Me diagnosticaron una enfermedad, ¿me lo recomienda?",
  ])("aplica cautela determinista ante un riesgo de salud: %s", (question) => {
    const result = applyResponsibleCommunication({
      question,
      composition: composition(),
      product: product(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.composition.confidence).toBe("revisar");
    expect(result.data.composition.express).toContain("Consulta con un profesional de salud");
    expect(result.data.composition.express).not.toMatch(/sí,? (puede|puedes|te recomiendo)/i);
    expect(result.data.alerts).toContainEqual(expect.objectContaining({ code: "HEALTH_CAUTION" }));
  });

  it("bloquea un claim expresamente prohibido con una alerta nombrada", () => {
    const result = applyResponsibleCommunication({
      question: "¿Qué hace?",
      composition: composition({ express: "Cura enfermedades." }),
      product: product(),
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "RESPONSIBLE_CONTENT_BLOCKED", alerts: [{ code: "PROHIBITED_CLAIM" }] },
    });
  });

  it("bloquea un claim terapéutico aunque no esté en la lista literal", () => {
    const result = applyResponsibleCommunication({
      question: "¿Qué hace?",
      composition: composition({ express: "Este suplemento previene la diabetes." }),
      product: product(),
    });

    expect(result).toMatchObject({
      ok: false,
      error: { alerts: [{ code: "THERAPEUTIC_CLAIM" }] },
    });
  });

  it.each([{ verifiedAt: null }, { sources: [] }] satisfies Array<
    Partial<typeof products.$inferSelect>
  >)(
    "impide confianza alta cuando falta verificación o fuente: $verifiedAt $sources",
    (overrides) => {
      const result = applyResponsibleCommunication({
        question: "¿Qué aporta?",
        composition: composition(),
        product: product(overrides),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.composition.confidence).toBe("medio");
      expect(result.data.alerts).toContainEqual(
        expect.objectContaining({ code: "EVIDENCE_LIMITED" }),
      );
    },
  );

  it("rebaja a revisar cuando la respuesta usa un claim de cautela", () => {
    const result = applyResponsibleCommunication({
      question: "¿Qué aporta?",
      composition: composition({ express: "Puede apoyar una rutina nutricional." }),
      product: product(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.composition.confidence).toBe("revisar");
    expect(result.data.alerts).toContainEqual(expect.objectContaining({ code: "CAUTION_CLAIM" }));
  });

  it("convierte un rechazo del proveedor en una respuesta segura no vacía", () => {
    const result = applyResponsibleCommunication({
      question: "¿Qué aporta?",
      composition: composition(),
      product: product(),
      refusal: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.composition.confidence).toBe("revisar");
    expect(result.data.composition.express).toContain("profesional de salud");
    expect(result.data.alerts).toContainEqual(expect.objectContaining({ code: "AI_REFUSAL" }));
  });
});

describe("porcentaje del descuento del live", () => {
  it("deja pasar el descuento vigente de la sesion", () => {
    // Caso real: con precio especial al 10% el gate bloqueaba la respuesta
    // entera con UNVERIFIED_CLAIM, porque el descuento no vive en la ficha.
    const result = applyResponsibleCommunication({
      question: "cuanto cuesta",
      composition: composition({
        express: "Hoy tiene 10% de descuento: $170.000.",
        estandar: "Hoy tiene 10% de descuento: $170.000.",
        profunda: "Hoy tiene 10% de descuento: $170.000.",
      }),
      product: product(),
      promoPercent: 10,
    });

    expect(result.ok).toBe(true);
  });

  it("sigue bloqueando un porcentaje que no es el descuento", () => {
    const result = applyResponsibleCommunication({
      question: "funciona?",
      composition: composition({
        express: "Tiene 95% de efectividad comprobada.",
        estandar: "Tiene 95% de efectividad comprobada.",
        profunda: "Tiene 95% de efectividad comprobada.",
      }),
      product: product(),
      promoPercent: 10,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("RESPONSIBLE_CONTENT_BLOCKED");
  });

  it("sin precio especial activo, ningun porcentaje pasa", () => {
    const result = applyResponsibleCommunication({
      question: "cuanto cuesta",
      composition: composition({
        express: "Hoy tiene 10% de descuento.",
        estandar: "Hoy tiene 10% de descuento.",
        profunda: "Hoy tiene 10% de descuento.",
      }),
      product: product(),
      promoPercent: null,
    });

    expect(result.ok).toBe(false);
  });

  it("reconoce el descuento escrito con espacio antes del signo", () => {
    const result = applyResponsibleCommunication({
      question: "cuanto cuesta",
      composition: composition({
        express: "Hoy tiene 10 % de descuento.",
        estandar: "Hoy tiene 10 % de descuento.",
        profunda: "Hoy tiene 10 % de descuento.",
      }),
      product: product(),
      promoPercent: 10,
    });

    expect(result.ok).toBe(true);
  });
});
