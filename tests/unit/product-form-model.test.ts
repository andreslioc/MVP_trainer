import { describe, expect, it } from "vitest";

import {
  productFormDefaults,
  productFormSchema,
  toProductInput,
} from "../../src/app/(app)/app/knowledge/product-form-model.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";

const base = productFormDefaults();

describe("el formulario ya no pide JSON a mano", () => {
  it("arranca con listas vacias, no con corchetes de ejemplo", () => {
    expect(base.activeIngredients).toEqual([]);
    expect(base.faqs).toEqual([]);
    expect(base.sources).toEqual([]);
  });

  it("una cantidad vacia es sin dato, no un cero", () => {
    const input = toProductInput({
      ...base,
      activeIngredients: [{ name: "Magnesio", amountText: "", unit: "", verified: true }],
    });

    expect(input.activeIngredients?.[0]).toMatchObject({
      name: "Magnesio",
      verified: true,
      amount_per_serving: undefined,
      unit: undefined,
    });
  });

  it("convierte la cantidad escrita a numero para el validador", () => {
    const input = toProductInput({
      ...base,
      activeIngredients: [{ name: "Magnesio", amountText: "200", unit: "mg", verified: true }],
    });

    expect(input.activeIngredients?.[0]).toMatchObject({ amount_per_serving: 200, unit: "mg" });
  });

  it("un enlace o una nota vacios no viajan como cadena vacia", () => {
    const input = toProductInput({
      ...base,
      sources: [{ label: "Etiqueta del producto", url: "", note: "" }],
    });

    expect(input.sources?.[0]).toMatchObject({ label: "Etiqueta del producto" });
    expect(input.sources?.[0]?.url).toBeUndefined();
  });

  it("lo que sale del formulario pasa el validador del borde", () => {
    const values = {
      ...base,
      name: "Creatina",
      sku: "SAL-001",
      brand: "Super Store",
      category: "Deportivos",
      presentation: "300 g",
      format: "Polvo",
      imageUrl: "https://example.test/creatina.webp",
      description: "Creatina monohidratada en polvo.",
      priceCopText: "189000",
      benefits: [
        {
          claim: "Apoya el rendimiento",
          science_note: "Participa en la energia",
          evidence_level: "media" as const,
        },
        {
          claim: "Complementa la rutina",
          science_note: "Aporta creatina",
          evidence_level: "media" as const,
        },
        {
          claim: "Facil de tomar",
          science_note: "Se mezcla con agua",
          evidence_level: "media" as const,
        },
      ],
      faqs: [{ question: "¿Como se usa?", answer: "Una porcion al dia." }],
      objections: [{ objection: "No conozco la marca", response: "Es importada." }],
      differentiators: [{ claim: "Etiqueta a la vista", evidence: "Viene en el empaque." }],
      sources: [{ label: "Etiqueta del producto", url: "", note: "" }],
    };

    expect(productFormSchema.safeParse(values).success).toBe(true);
    const input = toProductInput(values);
    expect(productInputSchema.safeParse(input).success).toBe(true);
    expect(input).toMatchObject({
      sku: "SAL-001",
      imageUrl: "https://example.test/creatina.webp",
      description: "Creatina monohidratada en polvo.",
    });
  });

  it("una fila a medio llenar la senala el campo, no un JSON entero", () => {
    const parsed = productFormSchema.safeParse({
      ...base,
      faqs: [{ question: "", answer: "Una porcion al dia." }],
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    // La ruta apunta a la fila y al campo. Antes el error era "Escribe un
    // arreglo JSON valido" sobre el textarea completo, sin decir donde.
    const rutas = parsed.error.issues.map((issue) => issue.path.join("."));
    expect(rutas).toContain("faqs.0.question");
  });
});
