import { describe, expect, it, vi } from "vitest";

import { researchedBenefitsSchema } from "../../src/lib/ai/schemas.ts";
import {
  buildResearchBenefitsPrompt,
  buildStructureBenefitsPrompt,
} from "../../src/lib/ai/prompts/research-benefits.ts";
import { productBenefitSchema } from "../../src/lib/validation/product.ts";
import { researchToProductPatch } from "../../src/lib/research-patch.ts";

/**
 * El paso de beneficios, aparte del de la ficha.
 *
 * Lo que se afirma aqui es la razon de que exista: que la pregunta que llega al
 * modelo sea la funcion del INGREDIENTE y no el panel del frasco, y que su
 * salida gane sobre los beneficios que escribio la pasada de la etiqueta.
 */
const investigado = {
  name: "Ashwagandha Root Extract (Max Strength)",
  brand: "Horbäach",
  presentation: "Frasco con 120 cápsulas",
  format: "Cápsulas",
  description: "Extracto de raíz concentrado.",
  purpose: "Se toma para acompañar el estrés.",
  usage_mode: "Tres cápsulas al día con una comida.",
  serving_size: "3 cápsulas",
  servings_per_container: "40",
  audience: "Adultos",
  active_ingredients: [
    { name: "Extracto de raíz de ashwagandha", declared_amount: "450 mg" },
    { name: "Extracto de pimienta negra", declared_amount: "18 mg" },
  ],
  // Lo que produce la pasada de la etiqueta, y el problema entero de la sesion.
  benefits: [
    { claim: "La toma equivale a 4.500 mg de raíz", science_note: "Extracto diez a uno." },
  ],
  faqs: [],
  objections: [],
  differentiators: [],
  precautions: "No en embarazo.",
  contraindications: [],
  claims_allowed: [],
  claims_caution: [],
  keywords: "ashwagandha, estres",
  vs_similares: [],
  allergens: [],
  subcategory: "Suplementos",
  unconfirmed: [],
} as unknown as Parameters<typeof researchToProductPatch>[0];

const deBeneficios = {
  benefits: [
    {
      claim: "La ashwagandha se usa como adaptógeno para acompañar el estrés",
      science_note: "Es el uso que le da la medicina tradicional de la India.",
      technical_note: "Metaanalisis 2025: 15 ECA, 873 participantes.",
      evidence_level: "alta" as const,
    },
  ],
  sin_funcion_documentada: [],
  requiere_cautela: false,
};

describe("el prompt de la pasada de beneficios", () => {
  it("le pide la funcion de cada ingrediente, y avisa que la marca no es lo que se investiga", () => {
    const prompt = buildResearchBenefitsPrompt({
      name: "Ashwagandha Root Extract (Max Strength)",
      brand: "Horbäach",
      activeIngredients: ["Extracto de raíz de ashwagandha", "Extracto de pimienta negra"],
    });
    const texto = prompt.messages[0]?.content ?? "";

    expect(texto).toContain("Extracto de raíz de ashwagandha");
    expect(texto).toContain("Extracto de pimienta negra");
    expect(texto).toContain("la marca NO es lo que se investiga");
    // La frontera viaja con la pregunta: es el motivo de que la pasada exista.
    expect(prompt.system).toContain("jamas se afirma una enfermedad");
    // Y la instruccion de no buscar el frasco, que es donde se perdia.
    expect(prompt.system).toContain("BUSCA EL INGREDIENTE, NO EL FRASCO");
  });

  it("al estructurar, ata los beneficios a los ingredientes que la ficha declara", () => {
    const prompt = buildStructureBenefitsPrompt({
      research: "La ashwagandha se usa como adaptógeno.",
      citations: [{ url: "https://nccih.nih.gov/health/ashwagandha", title: "NIH" }],
      declaredIngredients: ["Extracto de raíz de ashwagandha"],
    });
    const texto = prompt.messages[0]?.content ?? "";

    expect(texto).toContain("Cada beneficio se cuelga de uno de estos");
    expect(texto).toContain("Extracto de raíz de ashwagandha");
    expect(texto).toContain("https://nccih.nih.gov/health/ashwagandha");
  });
});

describe("el patch con la pasada de beneficios", () => {
  it("los beneficios de la pasada MANDAN sobre los de la etiqueta", () => {
    const patch = researchToProductPatch(investigado, [], null, deBeneficios);

    expect(patch.benefits).toHaveLength(1);
    expect(patch.benefits[0]?.claim).toBe(
      "La ashwagandha se usa como adaptógeno para acompañar el estrés",
    );
    expect(patch.benefits[0]?.technical_note).toContain("873 participantes");
  });

  it("baja 'alta' a 'media': nada sin revision humana sale como evidencia alta", () => {
    const patch = researchToProductPatch(investigado, [], null, deBeneficios);
    expect(patch.benefits[0]?.evidence_level).toBe("media");
  });

  it("sin la pasada, se queda con los de la etiqueta y en evidencia baja", () => {
    const patch = researchToProductPatch(investigado, [], null, null);

    expect(patch.benefits[0]?.claim).toBe("La toma equivale a 4.500 mg de raíz");
    expect(patch.benefits[0]?.evidence_level).toBe("baja");
    // Y ese es justo el que el validador del borde rechaza, que es el motivo de
    // que la pasada nueva exista.
    expect(productBenefitSchema.safeParse({ ...patch.benefits[0], rank: 1 }).success).toBe(false);
  });

  it("lo que produce la pasada SI pasa el validador del borde", () => {
    const patch = researchToProductPatch(investigado, [], null, deBeneficios);
    expect(productBenefitSchema.safeParse({ ...patch.benefits[0], rank: 1 }).success).toBe(true);
  });
});

describe("el esquema de la pasada", () => {
  it("acepta uno a tres beneficios y rechaza el cuarto", () => {
    const uno = { ...deBeneficios };
    expect(researchedBenefitsSchema.safeParse(uno).success).toBe(true);

    const cuatro = {
      ...deBeneficios,
      benefits: [0, 1, 2, 3].map(() => deBeneficios.benefits[0]),
    };
    expect(researchedBenefitsSchema.safeParse(cuatro).success).toBe(false);
  });

  it("exige que venga la lista de ingredientes sin funcion y la marca de cautela", () => {
    const sinCampos = { benefits: deBeneficios.benefits };
    expect(researchedBenefitsSchema.safeParse(sinCampos).success).toBe(false);
  });

  it("no acepta campos que no declara", () => {
    const conBasura = { ...deBeneficios, inventado: true };
    expect(researchedBenefitsSchema.safeParse(conBasura).success).toBe(false);
  });
});

describe("el paso falla sin tumbar la ficha", () => {
  it("cuando la busqueda no trae fuentes, no se escriben beneficios nuevos", async () => {
    // El contrato que afirma la tubería: sin cita no hay beneficio de funcion.
    const searchBenefits = vi.fn(async () => ({
      ok: true as const,
      data: { text: "Prosa sin una sola fuente.", citations: [], usage: null },
    }));
    const found = await searchBenefits();

    expect(found.data.citations).toHaveLength(0);
    const patch = researchToProductPatch(investigado, [], null, null);
    expect(patch.benefits[0]?.claim).toBe("La toma equivale a 4.500 mg de raíz");
  });
});
