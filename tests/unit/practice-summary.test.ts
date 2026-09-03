import { describe, expect, it } from "vitest";

import { evaluationDimensionKeys } from "../../src/lib/ai/schemas.ts";
import {
  buildPracticeSummary,
  isPending,
  latestAnswers,
  practiceLevel,
  type SummaryAnswer,
  type SummaryQuestion,
} from "../../src/lib/training/summary.ts";

function question(id: string): SummaryQuestion {
  return {
    id,
    text: `Pregunta ${id}`,
    intent: "informacion",
    difficulty: "basica",
    productName: "Ficha de prueba",
  };
}

function scores(value: number, overrides: Partial<Record<string, number>> = {}) {
  return Object.fromEntries(
    evaluationDimensionKeys.map((key) => [
      key,
      { score: overrides[key] ?? value, reason: `Nota de ${key}` },
    ]),
  );
}

function answer(
  questionId: string,
  value: number | null,
  createdAt: string,
  overrides?: Partial<Record<string, number>>,
): SummaryAnswer {
  return {
    questionId,
    advisorAnswer: `Respuesta a ${questionId}`,
    scores: value === null ? null : scores(value, overrides),
    feedback: value === null ? null : "Feedback",
    improvedAnswer: value === null ? null : "Version mejorada",
    createdAt: new Date(createdAt),
  };
}

describe("buildPracticeSummary", () => {
  it("promedia solo lo evaluado y cuenta el resto como pendiente", () => {
    const summary = buildPracticeSummary({
      questions: [question("a"), question("b"), question("c")],
      answers: [answer("a", 4, "2026-09-01T10:00:00Z"), answer("b", 2, "2026-09-01T10:05:00Z")],
      activeSeconds: 630,
    });

    expect(summary.answered).toBe(2);
    expect(summary.pending).toBe(1);
    expect(summary.complete).toBe(false);
    expect(summary.score).toBe(3);
    expect(summary.activeMinutes).toBe(11);
    // La que no se respondio aparece igual en el detalle: el consolidado dice
    // que falto, no la esconde.
    expect(summary.rows.map((row) => row.pending)).toEqual([false, false, true]);
  });

  it("se queda con el ultimo intento de cada pregunta, no con el primero", () => {
    const summary = buildPracticeSummary({
      questions: [question("a")],
      answers: [
        // Llegan en el orden de la consulta (mas reciente primero) y la fecha
        // es la que decide, no la posicion en el arreglo.
        answer("a", 5, "2026-09-01T11:00:00Z"),
        answer("a", 1, "2026-09-01T10:00:00Z"),
      ],
      activeSeconds: 0,
    });

    expect(summary.score).toBe(5);
    expect(summary.complete).toBe(true);
  });

  it("una respuesta guardada sin evaluar deja la pregunta pendiente", () => {
    const sinEvaluar = answer("a", null, "2026-09-01T10:00:00Z");
    expect(isPending(sinEvaluar)).toBe(true);
    expect(isPending(undefined)).toBe(true);

    const summary = buildPracticeSummary({
      questions: [question("a")],
      answers: [sinEvaluar],
      activeSeconds: 0,
    });
    expect(summary.answered).toBe(0);
    expect(summary.score).toBeNull();
    expect(summary.level).toBeNull();
    expect(summary.complete).toBe(false);
  });

  it("ordena las dimensiones de mejor a peor y no repite una en los dos grupos", () => {
    const summary = buildPracticeSummary({
      questions: [question("a")],
      answers: [answer("a", 3, "2026-09-01T10:00:00Z", { uso_cta: 1, conocimiento_producto: 5 })],
      activeSeconds: 0,
    });

    expect(summary.dimensions[0]?.key).toBe("conocimiento_producto");
    expect(summary.dimensions.at(-1)?.key).toBe("uso_cta");
    expect(summary.improvements[0]?.key).toBe("uso_cta");
    const solape = summary.strengths.filter((fuerte) =>
      summary.improvements.some((flojo) => flojo.key === fuerte.key),
    );
    expect(solape).toEqual([]);
  });

  it("sin ninguna pregunta no se declara terminada", () => {
    const summary = buildPracticeSummary({ questions: [], answers: [], activeSeconds: 0 });
    expect(summary.complete).toBe(false);
    expect(summary.score).toBeNull();
  });
});

describe("latestAnswers", () => {
  it("indexa por pregunta y no mezcla dos preguntas distintas", () => {
    const latest = latestAnswers([
      answer("a", 4, "2026-09-01T10:00:00Z"),
      answer("b", 2, "2026-09-01T10:01:00Z"),
    ]);
    expect(latest.get("a")?.scores?.uso_cta?.score).toBe(4);
    expect(latest.get("b")?.scores?.uso_cta?.score).toBe(2);
  });
});

describe("practiceLevel", () => {
  it("parte los cuatro tramos en los limites declarados", () => {
    expect(practiceLevel(5)).toBe("excelente");
    expect(practiceLevel(4.5)).toBe("excelente");
    expect(practiceLevel(4.4)).toBe("bien");
    expect(practiceLevel(3.5)).toBe("bien");
    expect(practiceLevel(3.4)).toBe("aceptable");
    expect(practiceLevel(2.5)).toBe("aceptable");
    expect(practiceLevel(2.4)).toBe("reforzar");
    expect(practiceLevel(0)).toBe("reforzar");
  });
});
