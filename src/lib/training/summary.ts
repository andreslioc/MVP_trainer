/**
 * Consolidado de una practica: una sola nota, nueve promedios y el detalle
 * pregunta por pregunta.
 *
 * Vive en `lib/` y es puro a proposito: recibe las preguntas y las respuestas ya
 * leidas y no toca la base, asi que la aritmetica de la nota se prueba sin
 * sembrar una sesion. Tambien lo importa el componente que dibuja el resumen,
 * que corre en el servidor pero no debe arrastrar el cliente de base de datos.
 */

import { evaluationDimensionKeys } from "../ai/schemas.ts";

export type DimensionScores = Record<string, { score: number; reason: string }>;

/** Etiquetas largas de las nueve dimensiones, una sola vez para todo el modulo. */
export const trainingDimensionLabels = {
  conocimiento_producto: "Conocimiento del producto",
  claridad_explicacion: "Claridad de la explicación",
  naturalidad_cercania: "Naturalidad y cercanía",
  uso_responsable_evidencia: "Uso responsable de evidencia",
  manejo_objeciones: "Manejo de objeciones",
  capacidad_persuasion: "Capacidad de persuasión",
  uso_cta: "Uso de CTA",
  duracion: "Duración",
  cumplimiento_reglas_marca: "Reglas de marca",
} as const satisfies Record<(typeof evaluationDimensionKeys)[number], string>;

export type SummaryQuestion = {
  id: string;
  text: string;
  intent: string;
  difficulty: string;
  productName: string | null;
};

export type SummaryAnswer = {
  questionId: string;
  advisorAnswer: string;
  scores: DimensionScores | null;
  feedback: string | null;
  improvedAnswer: string | null;
  createdAt: Date;
};

function round(value: number) {
  return Math.round(value * 10) / 10;
}

/**
 * Reintentar una pregunta INSERTA otra respuesta en vez de sobrescribir la
 * anterior, asi que el consolidado se queda con la ultima de cada pregunta: la
 * nota de la practica es como quedo, no el primer intento.
 */
export function latestAnswers(answers: readonly SummaryAnswer[]) {
  const latest = new Map<string, SummaryAnswer>();
  for (const answer of answers) {
    const previous = latest.get(answer.questionId);
    if (!previous || previous.createdAt.getTime() <= answer.createdAt.getTime()) {
      latest.set(answer.questionId, answer);
    }
  }
  return latest;
}

/** Nota de una respuesta: promedio de las dimensiones que el modelo devolvio. */
export function answerScore(scores: DimensionScores | null) {
  if (!scores) return null;
  const values = evaluationDimensionKeys
    .map((key) => scores[key]?.score)
    .filter((value): value is number => typeof value === "number");
  if (values.length === 0) return null;
  return round(values.reduce((total, value) => total + value, 0) / values.length);
}

/**
 * Una pregunta esta pendiente si nunca se respondio o si su ultima respuesta
 * quedo sin evaluar: la evaluacion puede fallar con la respuesta ya guardada, y
 * en ese caso la practica todavia no paso por ahi.
 */
export function isPending(answer: SummaryAnswer | undefined) {
  return !answer?.scores;
}

export type PracticeLevel = "excelente" | "bien" | "aceptable" | "reforzar";

/** Cuatro tramos y no un porcentaje suelto: la asesora necesita saber si va bien. */
export function practiceLevel(score: number): PracticeLevel {
  if (score >= 4.5) return "excelente";
  if (score >= 3.5) return "bien";
  if (score >= 2.5) return "aceptable";
  return "reforzar";
}

export function buildPracticeSummary({
  questions,
  answers,
  activeSeconds,
}: {
  questions: readonly SummaryQuestion[];
  answers: readonly SummaryAnswer[];
  activeSeconds: number;
}) {
  const latest = latestAnswers(answers);
  const rows = questions.map((question, index) => {
    const answer = latest.get(question.id);
    return {
      position: index + 1,
      question,
      answer: answer ?? null,
      score: answerScore(answer?.scores ?? null),
      pending: isPending(answer),
    };
  });

  const evaluated = rows.filter((row) => row.score !== null);
  const score =
    evaluated.length > 0
      ? round(evaluated.reduce((total, row) => total + (row.score ?? 0), 0) / evaluated.length)
      : null;

  const dimensions = evaluationDimensionKeys
    .map((key) => {
      const values = evaluated
        .map((row) => row.answer?.scores?.[key]?.score)
        .filter((value): value is number => typeof value === "number");
      return {
        key,
        label: trainingDimensionLabels[key],
        score:
          values.length > 0
            ? round(values.reduce((total, value) => total + value, 0) / values.length)
            : null,
      };
    })
    // Estable entre recargas: a igual promedio manda el orden de las nueve
    // dimensiones, no el que devolvio la base.
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const ranked = dimensions.filter((dimension) => dimension.score !== null);
  return {
    total: questions.length,
    /** Respondidas Y evaluadas: una respuesta sin nota no cuenta como cubierta. */
    answered: evaluated.length,
    pending: rows.filter((row) => row.pending).length,
    complete: rows.length > 0 && rows.every((row) => !row.pending),
    score,
    level: score === null ? null : practiceLevel(score),
    activeMinutes: Math.round(activeSeconds / 60),
    dimensions,
    strengths: ranked.slice(0, 3),
    // `slice(-3)` sobre la misma lista ordenada: con menos de seis dimensiones
    // evaluadas los dos grupos se tocarian, y por eso se recorta el solape.
    improvements: ranked.slice(Math.max(3, ranked.length - 3)).reverse(),
    rows,
  };
}

export type PracticeSummary = ReturnType<typeof buildPracticeSummary>;
