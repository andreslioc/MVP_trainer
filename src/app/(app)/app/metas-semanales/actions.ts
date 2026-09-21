"use server";

import { revalidatePath } from "next/cache";

import type { WeeklyGoalInput } from "../../../../server/weekly-goals.ts";
import { saveWeeklyGoals } from "../../../../server/weekly-goals.ts";

export async function saveWeeklyGoalsAction(input: WeeklyGoalInput) {
  const result = await saveWeeklyGoals(input);
  if (result.ok) {
    revalidatePath("/app");
    revalidatePath("/app/metas-semanales");
  }
  return result;
}
