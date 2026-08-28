import { describe, expect, it } from "vitest";

import { asksSingleFact } from "../../src/lib/copilot/single-fact.ts";

describe("preguntas de un dato suelto", () => {
  it.each([
    "cuanto trae?",
    "¿cuántas cápsulas trae?",
    "que sabor tiene",
    "de que material es",
    "¿qué tamaño tiene?",
    "cuantos ml trae",
  ])("reconoce que solo piden un dato: %s", (question) => {
    expect(asksSingleFact(question)).toBe(true);
  });

  it.each([
    "para que sirve el aceite de oregano",
    "es antibiotico natural?",
    "cual es la diferencia con las capsulas",
    "estoy embarazada lo puedo tomar",
    // Empieza igual y ya no es un dato suelto: es una conversacion, y ahi el
    // CTA vuelve a tener sentido.
    "cuanto trae y me sirve si estoy tomando otra cosa para lo mismo",
  ])("no la marca cuando la pregunta abre conversación: %s", (question) => {
    expect(asksSingleFact(question)).toBe(false);
  });
});
