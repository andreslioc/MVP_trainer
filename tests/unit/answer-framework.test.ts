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
    // Y deja los dos casos en que si corresponde: dato ausente o decision
    // clinica individual.
    expect(ANSWER_FRAMEWORK).toContain("cuando el dato de verdad falta en la");
    expect(ANSWER_FRAMEWORK).toContain("una decision clinica");
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

  it("reconoce los cuatro tipos de CTA, no solo el cierre", () => {
    // El CTA era casi sinonimo de "compra ahora", y eso castigaba preguntar
    // "¿para que lo buscas?" — que en una comparacion es lo que permite
    // recomendar.
    for (const tipo of ["CIERRE", "ELECCION", "DESCUBRIMIENTO", "ASESORIA"]) {
      expect(ANSWER_FRAMEWORK).toContain(tipo);
    }
  });

  it("permite nombrar las dos referencias en una comparacion, sin prestarse datos", () => {
    // La regla anterior decia "nunca leyendo la ficha ajena" a secas, y se leia
    // como que no se podia ni nombrar la otra presentacion.
    expect(ANSWER_FRAMEWORK).toMatch(/se pueden NOMBRAR las dos/i);
    expect(ANSWER_FRAMEWORK).toMatch(/nunca se le presta un dato a la otra/i);
  });

  it("permite empezar en SI solo cuando la funcion esta respaldada", () => {
    expect(ANSWER_FRAMEWORK).toMatch(/compartir un ingrediente NO demuestra/i);
    expect(ANSWER_FRAMEWORK).toMatch(/la respuesta puede empezar en SI/i);
    expect(ANSWER_FRAMEWORK).toMatch(/hacen exactamente lo mismo/i);
  });

  it("no deja morir la conversacion cuando no se puede cerrar la comparacion", () => {
    expect(ANSWER_FRAMEWORK).toMatch(/LA CONVERSACION NO SE MUERE/i);
  });

  it("la comparacion explica en que ayudan antes de diferenciar el formato", () => {
    expect(ANSWER_FRAMEWORK).toMatch(/UNA COMPARACION COMPLETA NO ES SOLO EL FORMATO/i);
    expect(ANSWER_FRAMEWORK).toMatch(/OBLIGATORIO nombrarlo.+en que le ayudan/is);
    expect(ANSWER_FRAMEWORK).toMatch(/Decir solamente.+liquida.+capsulas.+es incompleto/is);
  });

  it("la cautela deja la via comercial abierta en vez de cerrar", () => {
    expect(ANSWER_FRAMEWORK).toMatch(/no obliga a dejar de vender/i);
    // El texto va envuelto a 100 columnas, asi que el salto de linea puede
    // caer en medio de la frase.
    expect(ANSWER_FRAMEWORK).toMatch(/no es\s+una consulta medica/i);
  });

  it("una condicion como contexto produce una respuesta de dos capas", () => {
    expect(ANSWER_FRAMEWORK).toMatch(/activan especial cautela SOLO/i);
    expect(ANSWER_FRAMEWORK).toMatch(/analiza las DOS CAPAS/i);
    expect(ANSWER_FRAMEWORK).toMatch(/primero contesta el dato.+termina/is);
    expect(ANSWER_FRAMEWORK).toMatch(/No se afirma ni se niega/i);
    expect(ANSWER_FRAMEWORK).toMatch(/TERMINA en ella, no en "consulta a tu medico"/i);
    expect(ANSWER_FRAMEWORK).toMatch(/EL LIMITE CLINICO SE MINIMIZA/i);
  });
});
