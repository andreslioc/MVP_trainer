import { describe, expect, it } from "vitest";

import { productBenefitSchema } from "../../src/lib/validation/product.ts";
import { findEmptyPhrase, isAllGeneric, isOnlyPackaging } from "../../src/lib/vague-claims.ts";

const benefit = (overrides: Record<string, unknown> = {}) => ({
  rank: 1,
  claim: "Aporta carvacrol y timol, los antioxidantes del orégano",
  science_note: "Son los compuestos del orégano a los que se atribuye su actividad antioxidante.",
  evidence_level: "alta" as const,
  ...overrides,
});

describe("regla de concreción", () => {
  it("rechaza el beneficio que produjo el modelo y no decía nada", () => {
    // Caso real: paso todos los filtros de seguridad sin afirmar nada.
    const result = productBenefitSchema.safeParse(
      benefit({
        claim: "Soporte al bienestar general",
        science_note:
          "Se utiliza tradicionalmente para apoyar diversos objetivos de salud, basado en prácticas históricas.",
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const paths = result.error.issues.map((issue) => issue.path[0]);
    expect(paths).toContain("claim");
    expect(paths).toContain("science_note");
  });

  it("deja pasar el beneficio que sí se puede señalar", () => {
    expect(productBenefitSchema.safeParse(benefit()).success).toBe(true);
  });

  it("nombra la frase vacía en el mensaje, para saber qué cambiar", () => {
    const result = productBenefitSchema.safeParse(
      benefit({ science_note: "Aporta múltiples beneficios a quien lo toma." }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      result.error.issues.some((issue) => issue.message.includes("multiples beneficios")),
    ).toBe(true);
  });

  it.each([
    "Soporte al bienestar general",
    "Apoyo integral para tu salud",
    "Complemento natural de calidad",
  ])("marca como vacía una frase hecha solo de palabras genéricas: %s", (claim) => {
    expect(isAllGeneric(claim)).toBe(true);
  });

  it.each([
    "Aporta 14 mg de aceite de orégano por porción",
    "Se toma en gotas o se aplica en la piel",
    "Su compuesto estrella es el carvacrol",
  ])("no marca una frase que nombra algo concreto: %s", (claim) => {
    expect(isAllGeneric(claim)).toBe(false);
    expect(findEmptyPhrase(claim)).toBeNull();
  });

  it("un número cuenta como sustancia aunque el resto sean palabras comunes", () => {
    expect(isAllGeneric("Rinde 393 porciones")).toBe(false);
  });

  it.each([
    "Rinde 393 porciones: un frasco te dura unos cuatro meses",
    "Aporta 14 mg por cada porción de 4 gotas",
    "Se toma en gotas o se aplica",
  ])("rechaza el dato de envase ocupando el espacio del beneficio: %s", (claim) => {
    expect(isOnlyPackaging(claim)).toBe(true);
    expect(productBenefitSchema.safeParse(benefit({ claim })).success).toBe(false);
  });

  it.each([
    "Aporta carvacrol y timol, los antioxidantes del orégano",
    "Se usa tradicionalmente como apoyo digestivo",
  ])("deja pasar lo que sí hace algo por la persona: %s", (claim) => {
    expect(isOnlyPackaging(claim)).toBe(false);
  });
});
