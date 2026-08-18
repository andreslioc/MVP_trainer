"use server";

import { revalidatePath } from "next/cache";

import { promoteInsight } from "../../../../server/insights.ts";
import { analyzeRecording } from "../../../../server/recordings/analyze.ts";

export async function analyzeRecordingAction(recordingId: string) {
  const result = await analyzeRecording(recordingId);
  if (result.ok) revalidatePath("/app/intelligence");
  return result;
}

export async function promoteInsightAction(insightId: string) {
  const result = await promoteInsight(insightId);
  if (result.ok) revalidatePath("/app/intelligence");
  return result;
}
