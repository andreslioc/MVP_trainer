"use server";

import { revalidatePath } from "next/cache";

import {
  generateCategoryTrainingQuestions,
  startCategoryTrainingSession,
} from "../../../../server/training/categories.ts";
import { evaluateTrainingAnswer } from "../../../../server/training/evaluate.ts";
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
  revalidatePath(`/app/training/${input.sessionId}`);
  return result;
}
