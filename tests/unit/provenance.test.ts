import { describe, expect, it } from "vitest";

import { findProvenance } from "../../src/lib/camera-register.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import { validProductInput } from "../fixtures/product.ts";

describe("la trazabilidad se guarda, no se dice", () => {
  it("rechaza el para qué sirve que cita la fuente en vez de dar el dato", () => {
    // Caso real: salió al aire como "el fabricante lo presenta como apoyo…",
    // que suena a que la asesora no se la juega.
    const result = productInputSchema.safeParse(
      validProductInput({
        purpose: "En la piel, el fabricante lo presenta como apoyo para una apariencia saludable.",
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path[0] === "purpose")).toBe(true);
  });

  it("deja pasar el mismo dato dicho de frente", () => {
    const result = productInputSchema.safeParse(
      validProductInput({
        purpose: "En la piel se usa como apoyo para que se vea saludable, sobre piel sana.",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("permite la atribución en precauciones, donde suma autoridad", () => {
    const result = productInputSchema.safeParse(
      validProductInput({
        precautions: "La etiqueta declara expresamente que no es para embarazadas ni en lactancia.",
      }),
    );
    expect(result.success).toBe(true);
  });

  it.each([
    "El fabricante declara que contiene carvacrol.",
    "Según la etiqueta, se toma con comida.",
    "Ese dato está sin confirmar para esta presentación.",
  ])("reconoce la trazabilidad escrita de cualquier forma: %s", (texto) => {
    expect(findProvenance(texto)).not.toBeNull();
  });

  it("no marca una frase que solo da el dato", () => {
    expect(findProvenance("Contiene 14 mg de aceite de orégano por toma.")).toBeNull();
  });
});
