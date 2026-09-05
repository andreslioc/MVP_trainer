import { describe, expect, it } from "vitest";

import { productBenefitSchema } from "../../src/lib/validation/product.ts";
import {
  findEmptyPhrase,
  hasDeclaredQuantity,
  isAllGeneric,
  isOnlyPackaging,
} from "../../src/lib/vague-claims.ts";

const benefit = (overrides: Record<string, unknown> = {}) => ({
  rank: 1,
  claim: "Aporta carvacrol y timol, los antioxidantes del orégano",
  science_note: "Son los compuestos del orégano a los que se atribuye su actividad antioxidante.",
  evidence_level: "alta" as const,
  ...overrides,
});

describe("regla de concreción", () => {
  it("rechaza el beneficio que produjo el modelo y no decía nada", () => {
    // Caso real: paso todos los filtros de seguridad sin afirmar nada.
    const result = productBenefitSchema.safeParse(
      benefit({
        claim: "Soporte al bienestar general",
        science_note:
          "Se utiliza tradicionalmente para apoyar diversos objetivos de salud, basado en prácticas históricas.",
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const paths = result.error.issues.map((issue) => issue.path[0]);
    expect(paths).toContain("claim");
    expect(paths).toContain("science_note");
  });

  it("deja pasar el beneficio que sí se puede señalar", () => {
    expect(productBenefitSchema.safeParse(benefit()).success).toBe(true);
  });

  it("nombra la frase vacía en el mensaje, para saber qué cambiar", () => {
    const result = productBenefitSchema.safeParse(
      benefit({ science_note: "Aporta múltiples beneficios a quien lo toma." }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      result.error.issues.some((issue) => issue.message.includes("multiples beneficios")),
    ).toBe(true);
  });

  it.each([
    "Soporte al bienestar general",
    "Apoyo integral para tu salud",
    "Complemento natural de calidad",
  ])("marca como vacía una frase hecha solo de palabras genéricas: %s", (claim) => {
    expect(isAllGeneric(claim)).toBe(true);
  });

  it.each([
    "Aporta 14 mg de aceite de orégano por porción",
    "Se toma en gotas o se aplica en la piel",
    "Su compuesto estrella es el carvacrol",
  ])("no marca una frase que nombra algo concreto: %s", (claim) => {
    expect(isAllGeneric(claim)).toBe(false);
    expect(findEmptyPhrase(claim)).toBeNull();
  });

  it("un número cuenta como sustancia aunque el resto sean palabras comunes", () => {
    expect(isAllGeneric("Rinde 393 porciones")).toBe(false);
  });

  it.each([
    "Rinde 393 porciones: un frasco te dura unos cuatro meses",
    "Aporta 14 mg por cada porción de 4 gotas",
    "Se toma en gotas o se aplica",
  ])("rechaza el dato de envase ocupando el espacio del beneficio: %s", (claim) => {
    expect(isOnlyPackaging(claim)).toBe(true);
    expect(productBenefitSchema.safeParse(benefit({ claim })).success).toBe(false);
  });

  it.each([
    "Aporta carvacrol y timol, los antioxidantes del orégano",
    "Se usa tradicionalmente como apoyo digestivo",
  ])("deja pasar lo que sí hace algo por la persona: %s", (claim) => {
    expect(isOnlyPackaging(claim)).toBe(false);
  });
});

/**
 * Una cantidad declarada no es un beneficio.
 *
 * El agujero que dejaba pasar los beneficios que no lo eran: `isOnlyPackaging`
 * exige que TODAS las palabras sean de envase, asi que bastaba nombrar el
 * ingrediente para escapar —y nombrar el ingrediente es justo lo que pide la
 * regla de concrecion—. Las dos reglas se anulaban. Los casos de abajo salieron
 * de fichas reales del catalogo, no de un ejemplo inventado.
 */
describe("cantidad declarada", () => {
  const composicion = [
    "La toma diaria equivale a 4.500 mg de raíz de ashwagandha",
    "Lleva 18 mg de pimienta negra al 95% de piperina",
    "Aporta 600 mg de KSM-66 por porción",
    "Rinde 393 porciones",
    "Se toma 30 minutos antes de acostarse",
  ];

  for (const frase of composicion) {
    it(`rechaza "${frase}"`, () => {
      expect(hasDeclaredQuantity(frase)).toBe(true);
    });
  }

  const funciones = [
    "Aporta carvacrol y timol, los antioxidantes del orégano",
    "Se usa como adaptógeno, para acompañar el manejo del estrés del día a día",
    "La melatonina es la señal con la que el cuerpo avisa que es hora de dormir",
    "En la piel, apoyo para que se vea saludable",
  ];

  for (const frase of funciones) {
    it(`deja pasar "${frase}"`, () => {
      expect(hasDeclaredQuantity(frase)).toBe(false);
    });
  }

  it("atrapa la unidad escrita en palabras", () => {
    // Salio de revisar el catalogo: la ficha de calcio declaraba la D3 asi y
    // pasaba, porque el patron tenia "UI" pero no la version deletreada.
    expect(hasDeclaredQuantity("Aporta 1.000 unidades internacionales de vitamina D3")).toBe(true);
  });

  it("no confunde una palabra que empieza por una unidad", () => {
    // "5 mgs" si es cantidad; "3 grados" no, y "g" es prefijo de "grados".
    expect(hasDeclaredQuantity("Se conserva a 3 grados")).toBe(false);
    expect(hasDeclaredQuantity("Aporta 5 g de creatina")).toBe(true);
  });
});

/**
 * Una frase hecha solo de palabras genericas no dice nada, y los conectores no
 * la salvan. `isAllGeneric` no los ignoraba, asi que un "para" o un "en" la
 * desarmaban: "complemento para el bienestar general en adultos" —salida real
 * del modelo— pasaba entera.
 */
describe("frases genericas con conectores", () => {
  it("rechaza la frase que el modelo produjo de verdad", () => {
    expect(isAllGeneric("Complemento para el bienestar general en adultos")).toBe(true);
  });

  it("rechaza el ejemplo del docstring de este modulo", () => {
    expect(isAllGeneric("Soporte al bienestar general")).toBe(true);
  });

  it("rechaza el relleno que produjo con la regla nueva puesta", () => {
    // Segunda pasada del modelo ya con la autorizacion de funcion: el rank 1
    // salio bien y el rank 2 fue esto. Forzar el tercero —o el segundo— es como
    // se llena el hueco.
    expect(isAllGeneric("Promueve el equilibrio y bienestar general.")).toBe(true);
  });

  it("no rechaza una frase que nombra algo señalable", () => {
    expect(isAllGeneric("Apoya la función muscular normal")).toBe(false);
    expect(isAllGeneric("Favorece la función muscular normal")).toBe(false);
    expect(isAllGeneric("Se usa como adaptógeno para el estrés del día a día")).toBe(false);
    // Nombra la situacion, asi que no es relleno aunque empiece por "apoyo". El
    // prompt empuja a la forma mejor —el ingrediente y su funcion—, pero
    // rechazarla aqui seria pasarse: si dice de que habla.
    expect(isAllGeneric("Apoyo en la gestión del estrés diario.")).toBe(false);
  });
});

describe("el esquema del beneficio rechaza la cantidad", () => {
  it("no acepta un claim que declara miligramos", () => {
    const result = productBenefitSchema.safeParse(
      benefit({ claim: "La toma diaria equivale a 4.500 mg de raíz de ashwagandha" }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      result.error.issues.some((issue) => issue.message.includes("declara una cantidad")),
    ).toBe(true);
  });

  it("sí acepta la cifra en la nota, que es su sitio", () => {
    const result = productBenefitSchema.safeParse(
      benefit({
        claim: "Se usa como adaptógeno, para acompañar el manejo del estrés",
        science_note: "Son 450 mg de extracto 10:1 por toma de tres cápsulas.",
      }),
    );

    expect(result.success).toBe(true);
  });
});
