import { describe, expect, it } from "vitest";

import { buildProductKnowledge } from "../../src/server/product-knowledge.ts";

describe("buildProductKnowledge", () => {
  it("calcula el nivel actual por producto y compara solo los productos con linea base", () => {
    const result = buildProductKnowledge(
      [
        { productId: "a", name: "Producto A", score: 80, answers: 4 },
        { productId: "b", name: "Producto B", score: 60, answers: 2 },
      ],
      [
        { productId: "a", name: "Producto A", score: 65, answers: 3 },
        { productId: "c", name: "Producto C", score: 90, answers: 5 },
      ],
    );

    expect(result).toEqual(
      expect.objectContaining({
        score: 70,
        delta: 15,
        answers: 6,
        products: 2,
        comparableProducts: 1,
      }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({ productId: "a", delta: 15, status: "mejoro" }),
      expect.objectContaining({ productId: "b", delta: null, status: "linea_base" }),
    ]);
  });

  it("no presenta cero como conocimiento cuando aun no hay evaluaciones", () => {
    expect(buildProductKnowledge([], [])).toEqual({
      score: null,
      delta: null,
      answers: 0,
      products: 0,
      comparableProducts: 0,
      items: [],
    });
  });
});
