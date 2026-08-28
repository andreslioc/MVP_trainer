import { describe, expect, it } from "vitest";

import { CLAIM_MAX_WORDS, countWords, findJargon } from "../../src/lib/camera-register.ts";
import { productBenefitSchema } from "../../src/lib/validation/product.ts";

const benefit = (overrides: Record<string, unknown> = {}) => ({
  rank: 1,
  claim: "Su compuesto estrella es el carvacrol",
  science_note: "Es el compuesto del orégano que más se estudia.",
  evidence_level: "baja" as const,
  ...overrides,
});

describe("registro de cámara", () => {
  it("deja pasar una frase que la asesora puede decir al aire", () => {
    expect(productBenefitSchema.safeParse(benefit()).success).toBe(true);
  });

  it("rechaza la jerga en la frase que se dice y nombra el término", () => {
    const result = productBenefitSchema.safeParse(
      benefit({ claim: "Actividad antifúngica documentada in vitro" }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((candidate) => candidate.path[0] === "claim");
    expect(issue?.message).toContain("in vitro");
  });

  it("rechaza la jerga en el porqué, que también se lee al aire", () => {
    const result = productBenefitSchema.safeParse(
      benefit({
        science_note: "Una revisión sistemática midió la concentración mínima inhibitoria.",
      }),
    );
    expect(result.success).toBe(false);
  });

  it("admite la jerga en el respaldo técnico, que es el campo que existe para ella", () => {
    const result = productBenefitSchema.safeParse(
      benefit({
        technical_note:
          "Revisión sistemática, Chem Biodivers 2025, PMID 39948037: concentración mínima inhibitoria frente a Candida.",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rechaza una frase que se volvió párrafo", () => {
    const largo = Array.from({ length: CLAIM_MAX_WORDS + 1 }, () => "palabra").join(" ");
    expect(countWords(largo)).toBeGreaterThan(CLAIM_MAX_WORDS);
    expect(productBenefitSchema.safeParse(benefit({ claim: largo })).success).toBe(false);
  });

  it("no marca como jerga las palabras que sí venden", () => {
    expect(findJargon("Aporta carvacrol y timol, los compuestos del orégano")).toBeNull();
    expect(findJargon("Su propiedad antioxidante")).toBeNull();
  });
});
