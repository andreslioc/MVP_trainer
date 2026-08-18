"use server";

import { revalidatePath } from "next/cache";

import {
  generateTrainingQuestions,
  startTrainingSession,
} from "../../../../server/training/questions.ts";
import { evaluateTrainingAnswer } from "../../../../server/training/evaluate.ts";

export async function generateTrainingQuestionsAction(productId: string) {
  const result = await generateTrainingQuestions(productId);
  if (result.ok) revalidatePath("/app/training");
  return result;
}

export async function startTrainingSessionAction(productId: string) {
  return startTrainingSession(productId);
}

export async function evaluateTrainingAnswerAction(input: {
  sessionId: string;
  questionId: string;
  advisorAnswer: string;
}) {
  const result = await evaluateTrainingAnswer(input);
  revalidatePath(`/app/training/${input.sessionId}`);
  return result;
}
