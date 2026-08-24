import { describe, expect, it } from "vitest";

import { productInputSchema, productValidationError } from "../../src/lib/validation/product.ts";
import { validProductInput } from "../fixtures/product.ts";

describe("product validation", () => {
  it("accepts the complete Knowledge Hub shape", () => {
    const result = productInputSchema.safeParse(validProductInput());

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.benefits.map((benefit) => benefit.rank)).toEqual([1, 2, 3]);
    expect(result.data.sources[0]?.label).toBe("Etiqueta del producto");
    expect(result.data.description).toBe("Suplemento de magnesio en cápsulas.");
  });

  it("validates an optional product image URL", () => {
    const result = productInputSchema.safeParse(validProductInput({ imageUrl: "no-es-una-url" }));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(productValidationError(result.error).field).toBe("imageUrl");
  });

  it.each([2, 4])("rejects %i benefits and names the benefits field", (benefitCount) => {
    const benefits = validProductInput().benefits.slice(0, benefitCount);
    while (benefits.length < benefitCount) {
      benefits.push({
        rank: 3,
        claim: "Beneficio adicional",
        science_note: "Nota adicional",
        evidence_level: "baja",
      });
    }
    const result = productInputSchema.safeParse(validProductInput({ benefits }));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(productValidationError(result.error).field).toBe("benefits");
  });

  it("requires a source whenever evidence is marked high", () => {
    const result = productInputSchema.safeParse(validProductInput({ sources: [] }));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(productValidationError(result.error)).toMatchObject({
      code: "INVALID_PRODUCT",
      field: "sources",
    });
  });

  it("rejects an unverified ingredient carrying a precise amount", () => {
    const result = productInputSchema.safeParse(
      validProductInput({
        activeIngredients: [
          {
            name: "Ingrediente sin verificar",
            amount_per_serving: 10,
            unit: "mg",
            verified: false,
          },
        ],
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(["activeIngredients", 0, "amount_per_serving"]);
  });
});
