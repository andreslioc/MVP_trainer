import { describe, expect, it } from "vitest";

import { ANSWER_FRAMEWORK } from "../../src/lib/ai/prompts/answer-framework.ts";
import { COPILOT_COMPOSE_PROMPT } from "../../src/lib/ai/prompts/copilot.ts";
import { EVALUATE_ANSWER_PROMPT } from "../../src/lib/ai/prompts/evaluate-answer.ts";
import { GENERATE_QUESTIONS_PROMPT } from "../../src/lib/ai/prompts/generate-questions.ts";

/**
 * El Copilot responde, el generador escribe la respuesta ideal y el evaluador
 * califica. Si los tres no comparten la misma definicion de buena respuesta, el
 * simulador premia lo que el Copilot no diria y la asesora recibe dos ensenanzas
 * opuestas de la misma herramienta. Esta prueba es la que impide que vuelvan a
 * separarse.
 */
describe("forma de la respuesta", () => {
  it("es la misma en el Copilot, en la respuesta ideal y en la evaluacion", () => {
    for (const prompt of [
      COPILOT_COMPOSE_PROMPT,
      GENERATE_QUESTIONS_PROMPT,
      EVALUATE_ANSWER_PROMPT,
    ]) {
      expect(prompt).toContain(ANSWER_FRAMEWORK);
    }
  });

  it("cierra la salida por cautela cuando el dato esta en la ficha", () => {
    expect(ANSWER_FRAMEWORK).toContain("PROHIBIDO USAR LA CAUTELA COMO SALIDA");
    expect(ANSWER_FRAMEWORK).toContain("revisa la etiqueta");
    // Y deja los dos casos en que si es la respuesta correcta.
    expect(ANSWER_FRAMEWORK).toContain("cuando el dato de verdad falta en la");
    expect(ANSWER_FRAMEWORK).toContain("embarazo, lactancia, medicamentos");
  });

  it("obliga a hablar como una persona en los tres modulos", () => {
    // El framework es lo unico que leen a la vez el Copilot, el generador de
    // preguntas y el evaluador. Si la regla vive solo en uno, el Simulator
    // ensena a decir lo que el Copilot tiene prohibido.
    expect(ANSWER_FRAMEWORK).toContain("SE DICE EN VOZ ALTA");
    expect(ANSWER_FRAMEWORK).toContain("vehiculo");
  });

  it("prohíbe la respuesta prudente que no dice nada", () => {
    expect(ANSWER_FRAMEWORK).toContain("TIENE QUE DECIR ALGO");
    expect(ANSWER_FRAMEWORK).toContain("¿como cual?");
  });

  it("exige la respuesta directa siempre y el CTA solo cuando aporta", () => {
    expect(ANSWER_FRAMEWORK).toContain("Lo unico que nunca falta es la pieza 1");
    expect(ANSWER_FRAMEWORK).toContain("EL CTA NO ES AUTOMATICO");
  });
});
