"use server";

import { recordPretrainingTime } from "../../../../server/pretraining-time.ts";

/** Pulso silencioso: guardar tiempo no debe revalidar ni interrumpir la lectura. */
export async function recordPretrainingTimeAction(input: { productId: string; seconds: number }) {
  return recordPretrainingTime(input);
}
