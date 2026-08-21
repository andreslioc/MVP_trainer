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
