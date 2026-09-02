import { describe, expect, it } from "vitest";

import { findAllergensInIngredients, mentionsAllergen } from "../../src/lib/allergens.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import { validProductInput } from "../fixtures/product.ts";

const conAceiteDeOliva = {
  activeIngredients: [
    { name: "Aceite de orégano orgánico", amount_per_serving: 14, unit: "mg", verified: true },
    { name: "Aceite de oliva virgen extra orgánico — es el que lo diluye", verified: true },
  ],
};

describe("un alergeno presente se dice, y se dice dos veces", () => {
  it("rechaza la ficha que lleva aceite de oliva y no lo advierte", () => {
    // Caso real: la tuberia genero esta ficha sin una palabra sobre el olivo en
    // ningun campo, con la regla escrita tres veces en el prompt.
    const result = productInputSchema.safeParse(
      validProductInput({
        ...conAceiteDeOliva,
        precautions: "No usar en embarazo ni lactancia. Mantener fuera del alcance de los niños.",
        contraindications: ["Embarazo", "Lactancia"],
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const campos = result.error.issues.map((issue) => issue.path[0]);
    expect(campos).toContain("precautions");
    expect(campos).toContain("contraindications");
  });

  it("exige el aviso en los casos de no uso, no solo en precauciones", () => {
    const result = productInputSchema.safeParse(
      validProductInput({
        ...conAceiteDeOliva,
        precautions: "Lleva aceite de oliva: quien sea alérgico al olivo no debe usarlo.",
        contraindications: ["Embarazo", "Lactancia"],
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path[0] === "contraindications")).toBe(true);
  });

  it("deja pasar la ficha que lo advierte en las dos partes", () => {
    const result = productInputSchema.safeParse(
      validProductInput({
        ...conAceiteDeOliva,
        precautions:
          "Lleva aceite de oliva virgen extra: quien tenga alergia al olivo o a la aceituna no debe usarlo, ni tomado ni en la piel.",
        contraindications: ["Alergia al olivo o a la aceituna: lleva aceite de oliva", "Embarazo"],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("no inventa un alergeno donde no lo hay", () => {
    expect(findAllergensInIngredients(["Magnesio", "Citrato de magnesio"])).toEqual([]);
  });

  it.each([
    ["aceite de oliva", "Aceite de oliva virgen extra orgánico"],
    ["soya", "Lecitina de soya"],
    ["gluten", "Harina de trigo"],
    ["mani", "Proteína de maní"],
    ["mariscos", "Aceite de krill"],
  ])("reconoce %s escrito como aparece en una etiqueta", (esperado, ingrediente) => {
    expect(findAllergensInIngredients([ingrediente])).toContain(esperado);
  });

  it("cuenta como aviso cualquiera de las formas del alergeno", () => {
    // Una ficha que advierte del "olivo" ya cubrio el "aceite de oliva": lo que
    // importa es que quien escucha pueda decidir.
    expect(
      mentionsAllergen("aceite de oliva", "Si eres alérgica al olivo, este no es para ti."),
    ).toBe(true);
    expect(mentionsAllergen("aceite de oliva", "No usar en embarazo.")).toBe(false);
  });

  it("nombra el alergeno en el mensaje, no solo el campo", () => {
    const result = productInputSchema.safeParse(
      validProductInput({
        activeIngredients: [{ name: "Aceite de pescado", verified: true }],
        precautions: "Consulte a su médico.",
        contraindications: [],
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.message.includes("pescado"))).toBe(true);
  });

  it.each([
    [
      "Trigonella foenum-graecum (fenogreco, semilla)",
      "el nombre botanico del fenogreco contiene trigo",
    ],
    [
      "Silicona de grado alimenticio — partes en contacto con la leche",
      "la leche de un extractor no es un ingrediente",
    ],
    [
      "Cápsula vegetal, libre de gluten y sin lactosa",
      "un atributo de venta no es un alergeno presente",
    ],
  ])("no acusa un falso positivo: %s", (ingrediente) => {
    // Los tres salieron de auditar el catalogo con la primera version del gate.
    expect(findAllergensInIngredients([ingrediente])).toEqual([]);
  });
});

describe("lanolina", () => {
  it("la reconoce en la lista de ingredientes", () => {
    expect(findAllergensInIngredients(["Lanolina — al 15,5%, viene de la lana"])).toContain(
      "lanolina",
    );
  });

  it("reconoce tambien los alcoholes de lanolina", () => {
    expect(findAllergensInIngredients(["Alcoholes de lanolina, derivados de la lana"])).toContain(
      "lanolina",
    );
  });

  it("no la ve donde no esta", () => {
    expect(findAllergensInIngredients(["Oxido de zinc al 15%", "Pantenol"])).not.toContain(
      "lanolina",
    );
  });
});
