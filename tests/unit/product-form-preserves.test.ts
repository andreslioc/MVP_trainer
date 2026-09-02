import { describe, expect, it } from "vitest";

import {
  type EditableProduct,
  productFormDefaults,
  toProductInput,
} from "../../src/app/(app)/app/knowledge/product-form-model.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import { validProductInput } from "../fixtures/product.ts";

const RESPUESTA = {
  what_it_is: "Es colágeno en polvo, sin sabor.",
  what_for: "Suma colágeno a tu día.",
  benefits: "Cada toma te da 20 gramos de colágeno y 18 de proteína.",
  science: "Son péptidos: el colágeno ya partido en pedazos pequeños.",
  different: "Otras fórmulas lo mezclan con vitamina C. Esta trae un solo ingrediente.",
  trust: "La etiqueta trae sellos kosher, Paleo y Whole30.",
  commercial: "Rinde 13 tomas. Cuesta 135.429 pesos.",
  cta: "Si te interesa, escríbeme en el chat.",
  warning: "Es colágeno bovino: no sirve para dieta vegetariana.",
};

function editable(): EditableProduct {
  return {
    ...productInputSchema.parse(
      validProductInput({
        advisorSummary: "Lo que la asesora tiene que recordar antes de salir en camara.",
        cautionGuidance: [
          {
            claim: "Apoya la piel",
            reason: "Suena a promesa.",
            safe_form: "Es apoyo, no un tratamiento.",
          },
        ],
        avoidGuidance: [
          { avoid: "Cura enfermedades", reason: "Prohibido.", alternative: "Es un complemento." },
        ],
        fullAnswer: RESPUESTA,
      }),
    ),
    verifiedAt: null,
  } as EditableProduct;
}

describe("guardar desde el Hub no borra lo que el formulario no muestra", () => {
  it("conserva el resumen, la cautela y los casos de no uso", () => {
    // Paso de verdad: verificar una ficha desde el Hub le quito los tres, sin
    // un solo mensaje de error.
    const product = editable();
    const saved = toProductInput(productFormDefaults(product), product);
    expect(saved.advisorSummary).toBe(product.advisorSummary);
    expect(saved.cautionGuidance).toEqual(product.cautionGuidance);
    expect(saved.avoidGuidance).toEqual(product.avoidGuidance);
  });

  it("conserva la Respuesta Completa al guardar sin tocarla", () => {
    const product = editable();
    const saved = toProductInput(productFormDefaults(product), product);
    expect(saved.fullAnswer).toEqual(RESPUESTA);
  });

  it("la ficha guardada sigue pasando el validador", () => {
    const product = editable();
    const saved = toProductInput(productFormDefaults(product), product);
    expect(productInputSchema.safeParse(saved).success).toBe(true);
  });

  it("deja la Respuesta Completa en nulo cuando los nueve bloques están vacíos", () => {
    // Vacio es "todavia no tiene", no "tiene una en blanco".
    const product = editable();
    const values = productFormDefaults(product);
    const saved = toProductInput(
      {
        ...values,
        fullAnswer: {
          what_it_is: "",
          what_for: "",
          benefits: "",
          science: "",
          different: "",
          trust: "",
          commercial: "",
          cta: "",
          warning: "",
        },
      },
      product,
    );
    expect(saved.fullAnswer).toBeNull();
  });

  it("omite la advertencia vacía en vez de guardarla en blanco", () => {
    const product = editable();
    const values = productFormDefaults(product);
    const saved = toProductInput(
      { ...values, fullAnswer: { ...values.fullAnswer, warning: "   " } },
      product,
    );
    expect(saved.fullAnswer && "warning" in saved.fullAnswer).toBe(false);
  });
});
