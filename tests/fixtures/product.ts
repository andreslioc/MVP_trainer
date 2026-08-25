import type { ProductInput } from "../../src/lib/validation/product.ts";

export function validProductInput(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    sku: undefined,
    name: "Magnesio de prueba",
    brand: "Super Store Test",
    category: "Minerales",
    presentation: "Frasco 60 cápsulas",
    format: "Cápsula",
    imageUrl: undefined,
    description: "Suplemento de magnesio en cápsulas.",
    activeIngredients: [
      {
        name: "Magnesio",
        amount_per_serving: 200,
        unit: "mg",
        verified: true,
      },
    ],
    benefits: [
      {
        rank: 1,
        claim: "Complementa la ingesta de magnesio",
        science_note: "Aporte nutricional declarado en la etiqueta.",
        evidence_level: "alta",
      },
      {
        rank: 2,
        claim: "Formato práctico",
        science_note: "Presentación en cápsulas.",
        evidence_level: "media",
      },
      {
        rank: 3,
        claim: "Fácil de integrar a la rutina",
        science_note: "La porción está indicada en la etiqueta.",
        evidence_level: "baja",
      },
    ],
    faqs: [{ question: "¿Cuántas cápsulas trae?", answer: "La presentación trae 60 cápsulas." }],
    objections: [
      {
        objection: "Ya consumo otros suplementos",
        response: "Revisa tu rutina con un profesional.",
      },
    ],
    differentiators: [{ claim: "Etiqueta clara", evidence: "La porción está declarada." }],
    usageMode: "Una porción al día con agua.",
    precautions: "Consulta a un profesional si usas medicamentos.",
    contraindications: ["Embarazo", "Lactancia"],
    claimsAllowed: ["Complementa la ingesta de magnesio"],
    claimsCaution: ["Puede apoyar una rutina nutricional"],
    claimsForbidden: ["Cura enfermedades"],
    complementProductIds: [],
    sources: [{ label: "Etiqueta del producto", note: "Ficha interna verificada" }],
    verifiedAt: null,
    priceCop: 135_000,
    ...overrides,
  };
}
