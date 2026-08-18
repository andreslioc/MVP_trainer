import { describe, expect, it } from "vitest";

import { buildEvaluateAnswerPrompt } from "../../src/lib/ai/prompts/evaluate-answer.ts";
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
});
