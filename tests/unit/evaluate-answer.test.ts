import { describe, expect, it } from "vitest";

import {
  EVALUATE_ANSWER_PROMPT,
  buildEvaluateAnswerPrompt,
} from "../../src/lib/ai/prompts/evaluate-answer.ts";
import {
  type Evaluation,
  evaluationDimensionKeys,
  evaluationSchema,
} from "../../src/lib/ai/schemas.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import { validProductInput } from "../fixtures/product.ts";

function validEvaluation(): Evaluation {
  return {
    scores: Object.fromEntries(
      evaluationDimensionKeys.map((key) => [key, { score: 4, reason: `Motivo para ${key}` }]),
    ) as Evaluation["scores"],
    feedback: "Una respuesta clara con una oportunidad concreta de mejora.",
    improved_answer: "La ficha verificada indica que complementa la ingesta de magnesio.",
  };
}

describe("evaluation contract", () => {
  it("accepts exactly nine scored dimensions with reasons and an improved answer", () => {
    const parsed = evaluationSchema.parse(validEvaluation());

    expect(Object.keys(parsed.scores)).toEqual(evaluationDimensionKeys);
    expect(Object.values(parsed.scores).every(({ score, reason }) => score === 4 && reason)).toBe(
      true,
    );
  });

  it("rejects missing, extra, out-of-range and empty required values", () => {
    const missing = validEvaluation();
    delete (missing.scores as Partial<Evaluation["scores"]>).uso_cta;
    expect(evaluationSchema.safeParse(missing).success).toBe(false);

    expect(
      evaluationSchema.safeParse({
        ...validEvaluation(),
        scores: { ...validEvaluation().scores, inventada: { score: 3, reason: "No aplica" } },
      }).success,
    ).toBe(false);

    for (const score of [0, 6]) {
      const invalid = validEvaluation();
      invalid.scores.duracion.score = score;
      expect(evaluationSchema.safeParse(invalid).success).toBe(false);
    }

    const emptyReason = validEvaluation();
    emptyReason.scores.claridad_explicacion.reason = " ";
    expect(evaluationSchema.safeParse(emptyReason).success).toBe(false);
    expect(evaluationSchema.safeParse({ ...validEvaluation(), improved_answer: " " }).success).toBe(
      false,
    );
  });

  it("renders only the selected product context, question and advisor answer", () => {
    const product = productInputSchema.parse(
      validProductInput({ name: "Producto seleccionado", brand: "Marca elegida" }),
    );
    const prompt = buildEvaluateAnswerPrompt({
      product,
      question: {
        text: "¿Qué contiene?",
        idealAnswer: "Contiene magnesio según la etiqueta.",
        criteria: ["Nombra el ingrediente"],
      },
      advisorAnswer: "Contiene magnesio y debes revisar la etiqueta.",
    });

    expect(prompt.system).toContain("Producto seleccionado");
    expect(prompt.system).not.toContain("Producto no seleccionado");
    expect(prompt.messages[0]?.content).toContain("¿Qué contiene?");
    expect(prompt.messages[0]?.content).toContain("Contiene magnesio y debes revisar la etiqueta.");
  });

  it("entrega las hermanas de la linea SEPARADAS de la seleccionada", () => {
    // Sin las hermanas no se puede calificar "¿las gotas hacen lo mismo que las
    // capsulas?": el evaluador veia una sola ficha y tenia que creerle o no a la
    // asesora sobre la otra.
    //
    // Y van separadas a proposito: el evaluador tiene que poder decir "esa
    // caracteristica es de la otra referencia". En una sola lista se pierde cual
    // era la ficha practicada, que es justo lo que la rubrica pregunta.
    const prompt = buildEvaluateAnswerPrompt({
      product: productInputSchema.parse(
        validProductInput({ name: "Aceite en gotas", brand: "Piping Rock" }),
      ),
      siblings: [
        productInputSchema.parse(
          validProductInput({ name: "Aceite en capsulas", brand: "Piping Rock" }),
        ),
      ],
      question: { text: "¿es igual a las capsulas?", idealAnswer: "x", criteria: [] },
      advisorAnswer: "y",
    });

    expect(prompt.system).toContain("FICHA SELECCIONADA");
    expect(prompt.system).toContain("OTRAS REFERENCIAS DE LA MISMA LINEA");
    expect(prompt.system).toContain("Aceite en capsulas");
    expect(prompt.system.indexOf("FICHA SELECCIONADA")).toBeLessThan(
      prompt.system.indexOf("OTRAS REFERENCIAS"),
    );
  });

  it("no escribe el bloque de hermanas cuando no hay", () => {
    // Un encabezado con una lista vacia le sugiere al modelo que existe algo que
    // no le entregaron.
    const prompt = buildEvaluateAnswerPrompt({
      product: productInputSchema.parse(validProductInput()),
      question: { text: "¿que trae?", idealAnswer: "x", criteria: [] },
      advisorAnswer: "y",
    });
    expect(prompt.system).not.toContain("OTRAS REFERENCIAS");
  });
});

describe("reglas de comparacion en el prompt", () => {
  it("manda la ficha por encima de los criterios y de la respuesta ideal", () => {
    // El caso real: la respuesta ideal guardada decia "No, son muy distintos"
    // cuando la ficha solo sostiene que cambia la forma de uso. Con los
    // criterios mandando, cualquier "si" bien fundamentado se penalizaba.
    expect(EVALUATE_ANSWER_PROMPT).toContain("ORDEN DE PRIORIDAD");
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/nunca pueden obligar a inventar/i);
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/manda la ficha/i);
  });

  it("distingue comparar de mezclar referencias", () => {
    // La regla vieja decia "no mezclo presentaciones", que en una comparacion
    // castigaba justo lo que la pregunta pedia hacer.
    expect(EVALUATE_ANSWER_PROMPT).not.toContain("no mezcló presentaciones");
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/NO CONFUNDIR COMPARAR CON MEZCLAR/i);
  });

  it("acepta la funcion similar sin permitir el efecto identico", () => {
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/Compartir unicamente un ingrediente NO demuestra/i);
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/cumplen una función general similar/i);
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/exactamente el mismo efecto/i);
  });

  it("reconoce el descubrimiento y la asesoria como avance comercial", () => {
    // WhatsApp y "¿para que lo buscas?" dejan de ser relleno cuando la pregunta
    // compara referencias o falta saber la necesidad.
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/DESCUBRIMIENTO/);
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/ASESORIA|ASESORÍA/);
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/NO penalices el WhatsApp/i);
  });

  it("no aprueba una comparacion que omite el beneficio compartido disponible", () => {
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/explicar primero en que ayudan/i);
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/No des puntuacion maxima.+solo diga.+liquida/is);
  });
});

describe("continuidad comercial frente a la derivacion medica", () => {
  it("la seguridad dice que no se puede afirmar, no que se deje de vender", () => {
    // Era la conducta a corregir: "hay una minima duda de salud → consulta a tu
    // medico", que comercialmente equivale a "no te puedo ayudar, no compres".
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/NO OBLIGA A DEJAR DE VENDER/i);
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/DERIVACION MEDICA PREMATURA/i);
  });

  it("una respuesta defensiva no saca nota alta solo por prudente", () => {
    // Evidencia responsable puede ser 5 y aun asi perder en las comerciales.
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/Puede perder puntos en PERSUASION/i);
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/una venta abandonada/i);
  });

  it("una molestia no se trata como consulta medica", () => {
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/UNA MOLESTIA NO ES UNA CONSULTA MEDICA/i);
  });

  it("responde el dato y despues remite la compatibilidad individual", () => {
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/activan especial cautela SOLO/i);
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/DOS CAPAS/i);
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/primero debe responder cuantas trae/i);
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/la remision es obligatoria/i);
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/termina con una ruta comercial relevante/i);
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/Minimiza el limite clinico/i);
    for (const disparador of ["Embarazo", "lactancia", "medicamento"]) {
      expect(EVALUATE_ANSWER_PROMPT).toContain(disparador);
    }
  });

  it("evalua solo las rutas comerciales relevantes, no una lista obligatoria", () => {
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/cuales de estas rutas son RELEVANTES/i);
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/NO es obligatorio ejecutar las cinco/i);
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/WhatsApp cuando realmente permita avanzar/i);
  });

  it("la mejorada puede comparar todas las fichas disponibles sin trasladar datos", () => {
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/datos respaldados por las fichas disponibles/i);
    expect(EVALUATE_ANSWER_PROMPT).toMatch(/nunca trasladar una característica/i);
    expect(EVALUATE_ANSWER_PROMPT).not.toContain("utilizar exclusivamente la ficha;");
  });
});
