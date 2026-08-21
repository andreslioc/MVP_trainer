"use server";

import { revalidatePath } from "next/cache";

import { finishSimulation } from "../../../../../server/training/simulation-finish.ts";
import { startSimulation } from "../../../../../server/training/simulation.ts";

export async function startSimulationAction(input: {
  speed: "despacio" | "normal" | "rapido" | "aleatorio";
  durationS: number;
  questionCount: number;
}) {
  return startSimulation(input);
}

/**
 * El audio cruza como FormData porque es binario. `finishSimulation` valida el
 * identificador con Zod y filtra por `advisor_id`: el borde sigue siendo el
 * servidor, no este envoltorio.
 */
export async function finishSimulationAction(formData: FormData) {
  const simulationId = formData.get("simulationId");
  const audio = formData.get("audio");
  if (typeof simulationId !== "string" || !(audio instanceof File)) {
    return {
      ok: false as const,
      error: { code: "VALIDATION", message: "Falta el audio del simulacro." },
    };
  }

  const result = await finishSimulation({
    simulationId,
    audio: await audio.arrayBuffer(),
    contentType: audio.type || "audio/webm",
  });
  if (result.ok) revalidatePath("/app/training");
  return result;
}
