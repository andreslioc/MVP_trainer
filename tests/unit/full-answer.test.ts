import { describe, expect, it } from "vitest";

import { productInputSchema } from "../../src/lib/validation/product.ts";
import { validProductInput } from "../fixtures/product.ts";

const respuesta = {
  what_it_is: "Es magnesio en cápsula, 200 mg por toma.",
  what_for: "Suma magnesio a tu alimentación diaria.",
  benefits: "Aporta el magnesio que a veces falta en la comida del día.",
  science: "El magnesio participa en el trabajo de los músculos y del sistema nervioso.",
  different: "Una sola cápsula al día, frente a fórmulas que piden dos o tres.",
  trust: "Está hecho en instalaciones certificadas y verificado por laboratorio.",
  commercial: "Frasco de 60 cápsulas: dos meses a una diaria.",
  cta: "Si lo quieres, escríbeme en el chat y te lo aparto.",
};

describe("la Respuesta Completa se lee al aire", () => {
  it("acepta una respuesta con sus ocho bloques y sin advertencia", () => {
    // La advertencia es opcional a proposito: un producto sin limite real no
    // lleva una inventada para llenar el bloque.
    const result = productInputSchema.safeParse(validProductInput({ fullAnswer: respuesta }));
    expect(result.success).toBe(true);
  });

  it("acepta la advertencia cuando el producto sí tiene un límite", () => {
    const result = productInputSchema.safeParse(
      validProductInput({
        fullAnswer: { ...respuesta, warning: "No es para embarazo ni lactancia." },
      }),
    );
    expect(result.success).toBe(true);
  });

  it("sigue siendo válida una ficha que todavía no la tiene", () => {
    const result = productInputSchema.safeParse(validProductInput());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.fullAnswer).toBeNull();
  });

  it("rechaza la jerga: esto se dice en voz alta", () => {
    const result = productInputSchema.safeParse(
      validProductInput({
        fullAnswer: { ...respuesta, science: "Su biodisponibilidad es superior a la del óxido." },
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path.join(".") === "fullAnswer.science")).toBe(
      true,
    );
  });

  it("rechaza la trazabilidad en el bloque que describe", () => {
    const result = productInputSchema.safeParse(
      validProductInput({
        fullAnswer: { ...respuesta, what_for: "El fabricante lo presenta como apoyo diario." },
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rechaza la atribución también en el argumento de confianza", () => {
    // Al principio exceptue este bloque, pensando que ahi nombrar al fabricante
    // sumaba autoridad. Es al contrario: en una respuesta de venta "segun el
    // fabricante" se oye como que la asesora no se la juega. La atribucion solo
    // suma donde respalda una prohibicion —precauciones y casos de no uso—.
    const result = productInputSchema.safeParse(
      validProductInput({
        fullAnswer: { ...respuesta, trust: "El fabricante declara verificación de laboratorio." },
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path.join(".") === "fullAnswer.trust")).toBe(
      true,
    );
  });

  it.each(["el fabricante lo ofrece", "el fabricante lo describe", "el fabricante afirma"])(
    "reconoce la atribución escrita como %s",
    (marcador) => {
      // "el fabricante lo ofrece" era la forma que yo mas usaba al escribir y
      // no estaba en la lista: cuatro campos de una misma ficha la llevaban.
      const result = productInputSchema.safeParse(
        validProductInput({
          fullAnswer: { ...respuesta, what_for: `Sirve para esto: ${marcador} como apoyo diario.` },
        }),
      );
      expect(result.success).toBe(false);
    },
  );

  it("exige los ocho bloques: media respuesta no es una respuesta modelo", () => {
    const { cta: _cta, ...incompleta } = respuesta;
    const result = productInputSchema.safeParse(
      validProductInput({ fullAnswer: incompleta as typeof respuesta }),
    );
    expect(result.success).toBe(false);
  });
});
