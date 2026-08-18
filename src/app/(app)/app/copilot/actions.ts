"use server";

import { revalidatePath } from "next/cache";

import { endLiveSession, startLiveSession } from "../../../../server/copilot/session.ts";

export async function startLiveSessionAction() {
  const result = await startLiveSession();
  revalidatePath("/app/copilot");
  return result;
}

export async function endLiveSessionAction(sessionId: string) {
  const result = await endLiveSession(sessionId);
  revalidatePath("/app/copilot");
  return result;
}
