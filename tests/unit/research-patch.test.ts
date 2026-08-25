import { describe, expect, it } from "vitest";

import type { ResearchedProduct } from "../../src/lib/ai/schemas.ts";
import {
  CANONICAL_FORBIDDEN_CLAIMS,
  researchToProductPatch,
} from "../../src/lib/research-patch.ts";

function research(overrides: Partial<ResearchedProduct> = {}): ResearchedProduct {
  const base: ResearchedProduct = {
    name: "CELSIUS Live Fit Orange On-The-Go",
    brand: "CELSIUS",
    presentation: "Caja con 14 sobres de 5,25 g",
    format: "Polvo para preparar bebida",
    description: "Mezcla en polvo sabor naranja para preparar con agua.",
    active_ingredients: [
      { name: "Cafeína total", declared_amount: "200 mg" },
      { name: "Taurina", declared_amount: null },
    ],
    benefits: [
      { claim: "Aporta 200 mg de cafeína por sobre", science_note: "Declarado por el fabricante." },
      { claim: "Catorce porciones individuales", science_note: "Cantidad impresa en el empaque." },
      { claim: "Cero azúcar", science_note: "Declaración visible en el empaque." },
    ],
    faqs: [{ question: "¿Cuánta cafeína trae?", answer: "200 mg por sobre." }],
    objections: [{ objection: "Es mucha cafeína", response: "Cada sobre aporta 200 mg." }],
    differentiators: [{ claim: "14 sobres", evidence: "Frente del empaque." }],
    usage_mode: "Mezclar un sobre en 355 a 473 ml de agua.",
    contraindications: ["Menores de 18 años", "Embarazo", "Sensibilidad a la cafeína"],
    precautions: "No recomendado en embarazo ni lactancia.",
    claims_allowed: ["Cada sobre contiene 200 mg de cafeína."],
    claims_caution: ["Puede describirse como bebida energizante."],
    unconfirmed: ["Registro sanitario colombiano"],
  };
  return { ...base, ...overrides };
}

const citations = [
  { url: "https://www.celsius.com/essential-facts/", title: "CELSIUS — Essential Facts" },
];

describe("researchToProductPatch", () => {
  it("copia el modo de uso a la ficha", () => {
    expect(researchToProductPatch(research(), citations).usageMode).toBe(
      "Mezclar un sobre en 355 a 473 ml de agua.",
    );
  });

  it("nunca deja la ficha verificada", () => {
    expect(researchToProductPatch(research(), citations).verifiedAt).toBeNull();
  });

  it("guarda la cantidad en el nombre del ingrediente y sin verificar", () => {
    const patch = researchToProductPatch(research(), citations);

    expect(patch.activeIngredients).toEqual([
      { name: "Cafeína total — 200 mg declarados", verified: false },
      { name: "Taurina", verified: false },
    ]);
  });

  it("baja los tres beneficios a evidencia baja", () => {
    const patch = researchToProductPatch(research(), citations);

    expect(patch.benefits.map((benefit) => benefit.evidence_level)).toEqual([
      "baja",
      "baja",
      "baja",
    ]);
    expect(patch.benefits.map((benefit) => benefit.rank)).toEqual([1, 2, 3]);
  });

  it("mueve lo no confirmado a claims_caution y no a claims_allowed", () => {
    const patch = researchToProductPatch(research(), citations);

    expect(patch.claimsAllowed).toEqual(["Cada sobre contiene 200 mg de cafeína."]);
    expect(patch.claimsCaution).toContain(
      "Sin confirmar en la busqueda: Registro sanitario colombiano",
    );
  });

  it("copia los casos de no uso tal como los reporto la etiqueta", () => {
    const patch = researchToProductPatch(research(), citations);

    // Ni se resumen ni se completan: la lista es la de la etiqueta. Inventar una
    // contraindicacion asusta a quien si podia tomarlo.
    expect(patch.contraindications).toEqual([
      "Menores de 18 años",
      "Embarazo",
      "Sensibilidad a la cafeína",
    ]);
  });

  it("deja vacios los casos de no uso cuando la etiqueta no nombra ninguno", () => {
    const patch = researchToProductPatch(research({ contraindications: [] }), citations);

    expect(patch.contraindications).toEqual([]);
  });

  it("impone las cuatro prohibiciones sin preguntarle al modelo", () => {
    expect(researchToProductPatch(research(), citations).claimsForbidden).toEqual(
      CANONICAL_FORBIDDEN_CLAIMS,
    );
  });

  it("toma las fuentes de la busqueda, no del texto del modelo", () => {
    const patch = researchToProductPatch(research(), citations);

    expect(patch.sources).toEqual([
      {
        label: "CELSIUS — Essential Facts",
        url: "https://www.celsius.com/essential-facts/",
        note: "Abierta durante la investigacion automatica; pendiente de revision humana.",
      },
    ]);
  });
});
