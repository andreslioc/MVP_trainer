import { describe, expect, it } from "vitest";

import { findSimilarProducts, type NamedProduct } from "../../src/lib/similar-products.ts";

const oregano: NamedProduct = {
  id: "1",
  name: "Aceite de Oregano (Ecológico), (59 mL) Botella Gotero, Piping Rock",
  brand: "Piping Rock",
};
const catalog: NamedProduct[] = [
  oregano,
  { id: "2", name: "Magnesio Citrato 200 mg x120 Cap", brand: "Carlyle" },
  { id: "3", name: "Magnesio Glicinato 500 mg x180 Cap", brand: "Now Foods" },
  // Misma marca que el oregano, producto distinto: compartir "Piping" no es
  // parecerse.
  { id: "4", name: "Suplemento GABA 750 mg, Piping Rock", brand: "Piping Rock" },
];

describe("findSimilarProducts", () => {
  it("no marca como parecidas dos fichas que solo comparten la marca", () => {
    expect(findSimilarProducts(oregano, catalog)).toEqual([]);
  });

  it("encuentra las fichas que una clienta nombraria igual", () => {
    const magnesio = catalog[1] as NamedProduct;

    expect(findSimilarProducts(magnesio, catalog)).toEqual([
      { name: "Magnesio Glicinato 500 mg x180 Cap", brand: "Now Foods" },
    ]);
  });

  it("acota la lista para no inflar el prompt", () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      id: `m${index}`,
      name: `Magnesio variante ${index} x60 Cap`,
      brand: `Marca ${index}`,
    }));

    expect(findSimilarProducts(many[0] as NamedProduct, many)).toHaveLength(5);
  });
});
