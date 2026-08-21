"use server";

import { revalidatePath } from "next/cache";

import {
  endLiveSession,
  setSessionPromo,
  startLiveSession,
} from "../../../../server/copilot/session.ts";

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

export async function setSessionPromoAction(input: {
  sessionId: string;
  productId: string;
  percent: number | null;
}) {
  const result = await setSessionPromo(input);
  if (result.ok) revalidatePath("/app/copilot");
  return result;
}
