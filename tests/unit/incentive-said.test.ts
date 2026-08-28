import { describe, expect, it } from "vitest";

import { incentiveWasSaid } from "../../src/lib/copilot/incentive-said.ts";

const envioGratis = { ruleKey: "envio_gratis", value: { threshold_cop: 120000 } };
const conMensaje = {
  ruleKey: "originalidad",
  value: { message: "Productos importados de Estados Unidos" },
};

describe("un incentivo que no se dijo no cuenta como dicho", () => {
  it.each([
    "Recuerda que tenemos envío gratis en compras desde $120.000.",
    "El envío es gratis por compras superiores a 120000 pesos.",
    "Desde 120 mil el envío te sale gratis.",
  ])("lo reconoce cuando la cifra del umbral está dicha: %s", (answer) => {
    expect(incentiveWasSaid(answer, envioGratis)).toBe(true);
  });

  it("lo reconoce en la forma corta que se usa cuando el precio ya cubre el umbral", () => {
    expect(incentiveWasSaid("Y el envío te sale gratis con este.", envioGratis)).toBe(true);
  });

  it("es el caso que se veía en pantalla: la insignia decía envio_gratis y el texto no lo mencionaba", () => {
    const answer =
      "Este aceite tiene dos ingredientes: 14 mg de aceite de orégano orgánico y aceite de oliva virgen extra. Escríbenos al número que ves en pantalla y te apartamos el tuyo.";
    expect(incentiveWasSaid(answer, envioGratis)).toBe(false);
  });

  it("no acepta la clave interna de la regla como si fuera haberlo dicho", () => {
    expect(incentiveWasSaid("Aplica envio_gratis.", envioGratis)).toBe(false);
  });

  it("reconoce un incentivo de mensaje cuando sus palabras aparecen", () => {
    expect(
      incentiveWasSaid("Son productos importados directamente de Estados Unidos.", conMensaje),
    ).toBe(true);
  });

  it("no lo da por dicho con una sola coincidencia suelta", () => {
    expect(incentiveWasSaid("Es un producto muy bueno.", conMensaje)).toBe(false);
  });

  it("sin incentivo no hay nada que dar por dicho", () => {
    expect(incentiveWasSaid("Cualquier texto.", null)).toBe(false);
  });
});
