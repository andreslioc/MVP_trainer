"use server";

import { revalidatePath } from "next/cache";

import {
  generateCategoryTrainingQuestions,
  startCategoryTrainingSession,
} from "../../../../server/training/categories.ts";
import { evaluateTrainingAnswer } from "../../../../server/training/evaluate.ts";

export async function generateCategoryQuestionsAction(category: string) {
  const result = await generateCategoryTrainingQuestions(category);
  if (result.ok) revalidatePath("/app/training");
  return result;
}

export async function startCategorySessionAction(category: string) {
  return startCategoryTrainingSession(category);
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
