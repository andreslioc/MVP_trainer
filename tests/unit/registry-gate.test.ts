import { describe, expect, it } from "vitest";

import { findRegistryClaims, gapsDenyRegistry } from "../../src/lib/health-registry.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import { validProductInput } from "../fixtures/product.ts";

const sinRegistro = [
  "¿Tiene registro sanitario del INVIMA en Colombia? BUSCADO 2026-08-28 (no_publicado): no aparece en el registro público.",
];

describe("no se afirma el registro sanitario que no se encontro", () => {
  it("rechaza la ficha que afirma un INVIMA que sus propios huecos niegan", () => {
    const result = productInputSchema.safeParse(
      validProductInput({
        verificationGaps: sinRegistro,
        claimsAllowed: ["Producto con registro sanitario INVIMA vigente."],
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path[0] === "claimsAllowed")).toBe(true);
  });

  it("lo rechaza tambien en una respuesta a la clienta", () => {
    const result = productInputSchema.safeParse(
      validProductInput({
        verificationGaps: sinRegistro,
        faqs: [
          { question: "¿Es legal?", answer: "Sí, cuenta con registro del INVIMA." },
          { question: "¿Cómo se toma?", answer: "Una cápsula al día con la comida." },
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path[0] === "faqs")).toBe(true);
  });

  it("deja pasar la ficha que dice de frente que no lo tiene", () => {
    const result = productInputSchema.safeParse(
      validProductInput({
        verificationGaps: sinRegistro,
        faqs: [
          {
            question: "¿Tiene registro del INVIMA?",
            answer:
              "No lo podemos afirmar: buscamos esta referencia en el registro público de Colombia y no aparece. Se vende como suplemento importado.",
          },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("no opina cuando los huecos no hablan del registro", () => {
    // Sin el hallazgo de que no esta publicado, una ficha que menciona el
    // registro puede tenerlo de verdad y el gate no tiene por que intervenir.
    const result = productInputSchema.safeParse(
      validProductInput({
        verificationGaps: ["¿Cuál es la vida útil declarada?"],
        claimsAllowed: ["Producto con registro sanitario INVIMA vigente."],
      }),
    );
    expect(result.success).toBe(true);
  });

  it.each([
    "Cuenta con registro sanitario del INVIMA.",
    "Producto aprobado con notificación sanitaria.",
  ])("reconoce la afirmacion: %s", (texto) => {
    expect(findRegistryClaims(texto)).toHaveLength(1);
  });

  it.each([
    "No tiene registro del INVIMA.",
    "No se puede afirmar que tenga registro sanitario en Colombia.",
    "Ese dato está sin confirmar: no aparece en el registro del INVIMA.",
  ])("no confunde una negacion con una afirmacion: %s", (texto) => {
    expect(findRegistryClaims(texto)).toEqual([]);
  });

  it("separa por frase: una negacion no absuelve a la afirmacion vecina", () => {
    const claims = findRegistryClaims(
      "No hallamos la etiqueta local. El producto cuenta con registro sanitario INVIMA.",
    );
    expect(claims).toHaveLength(1);
    expect(claims[0]).toContain("cuenta con registro");
  });

  it("reconoce el hallazgo de que no esta publicado", () => {
    expect(gapsDenyRegistry(sinRegistro)).toBe(true);
    expect(gapsDenyRegistry(["¿Cuál es el material del frasco?"])).toBe(false);
  });
});
