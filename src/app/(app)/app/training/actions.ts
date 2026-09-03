"use server";

import { revalidatePath } from "next/cache";

import {
  generateCategoryTrainingQuestions,
  startCategoryTrainingSession,
} from "../../../../server/training/categories.ts";
import { evaluateTrainingAnswer } from "../../../../server/training/evaluate.ts";
import {
  finishPracticeIfComplete,
  finishPracticeNow,
  recordPracticeTime,
} from "../../../../server/training/practice-time.ts";
import {
  generateTrainingQuestions,
  startTrainingSession,
} from "../../../../server/training/questions.ts";

export async function generateCategoryQuestionsAction(category: string) {
  const result = await generateCategoryTrainingQuestions(category);
  if (result.ok) revalidatePath("/app/training");
  return result;
}

export async function startCategorySessionAction(category: string, practiceSize: number) {
  return startCategoryTrainingSession(category, practiceSize);
}

export async function generateProductQuestionsAction(productId: string) {
  const result = await generateTrainingQuestions(productId);
  if (result.ok) revalidatePath("/app/training");
  return result;
}

export async function startProductSessionAction(productId: string, practiceSize: number) {
  return startTrainingSession(productId, practiceSize);
}

export async function evaluateTrainingAnswerAction(input: {
  sessionId: string;
  questionId: string;
  advisorAnswer: string;
}) {
  const result = await evaluateTrainingAnswer(input);
  // Se cierra despues de guardar, no antes: si la evaluacion falla, la
  // practica sigue abierta y la asesora puede reintentar esa pregunta.
  if (result.ok) await finishPracticeIfComplete(input.sessionId);
  // A proposito NO se revalida la ruta: la pantalla muestra la primera pregunta
  // pendiente, y revalidar aqui la cambiaria por la siguiente en el mismo
  // instante en que llega la evaluacion —borrando de la pantalla el feedback
  // que la asesora acaba de pedir. El avance lo pide ella con "Siguiente".
  return result;
}

/** Cierra la practica con lo respondido hasta ahora y manda al consolidado. */
export async function finishPracticeNowAction(sessionId: string) {
  const result = await finishPracticeNow(sessionId);
  if (result.ok) revalidatePath("/app/training");
  return result;
}

/**
 * Pulso de tiempo de practica. No revalida nada: se llama cada 30 segundos y
 * revalidar la ruta en cada pulso volveria a pedir la pregunta al servidor
 * mientras la asesora esta escribiendo.
 */
export async function recordPracticeTimeAction(input: { sessionId: string; seconds: number }) {
  return recordPracticeTime(input);
}
