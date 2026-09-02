import { describe, expect, it } from "vitest";

import { findJargon, findProvenance } from "../../src/lib/camera-register.ts";
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

describe("una palabra de la lista que significa otra cosa", () => {
  it("deja pasar la advertencia de no conducir", () => {
    // "vehiculo" esta en la lista por el aceite portador de una capsula. En
    // "conducir un vehiculo" significa carro, y es la advertencia mas importante
    // de un producto con melatonina.
    expect(
      findJargon("Puede afectar la capacidad de conducir un vehículo o manejar maquinaria."),
    ).toBeNull();
  });

  it("sigue atrapando el aceite portador", () => {
    expect(findJargon("Aceite de oliva como vehiculo de la formula.")).toBe("vehiculo");
  });
});

describe("la jerga se busca como palabra, no como subcadena", () => {
  it.each([
    ["para que la fragancia no se degrade con la luz", "degrade contiene grade"],
    ["el envase es degradable", "degradable contiene grade"],
    ["viene en grado alimenticio", "grado no es grade"],
  ])("deja pasar %s", (texto) => {
    expect(findJargon(texto)).toBeNull();
  });

  it.each([
    ["La evidencia GRADE es baja.", "grade"],
    ["Medido in vitro.", "in vitro"],
    ["Su biodisponibilidad es alta.", "biodisponibilidad"],
    ["Aceite de oliva como vehiculo.", "vehiculo"],
  ])("sigue atrapando la jerga real en %s", (texto, esperado) => {
    expect(findJargon(texto)).toBe(esperado);
  });
});
