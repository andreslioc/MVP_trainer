"use server";

import { revalidatePath } from "next/cache";

import { promoteInsight } from "../../../../server/insights.ts";
import { analyzeRecording } from "../../../../server/recordings/analyze.ts";
import { transcribeRecording } from "../../../../server/recordings/transcribe-now.ts";
import { ingestTranscript } from "../../../../server/recordings/ingest.ts";
import { uploadRecording } from "../../../../server/recordings/upload.ts";

export async function analyzeRecordingAction(recordingId: string) {
  const result = await analyzeRecording(recordingId);
  if (result.ok) revalidatePath("/app/intelligence");
  return result;
}

export async function transcribeRecordingAction(recordingId: string) {
  const result = await transcribeRecording(recordingId);
  if (result.ok) revalidatePath("/app/intelligence");
  return result;
}

export async function promoteInsightAction(insightId: string) {
  const result = await promoteInsight(insightId);
  if (result.ok) revalidatePath("/app/intelligence");
  return result;
}

export async function ingestTranscriptAction(input: {
  transcript: string;
  chatLog?: string;
  durationS?: number;
}) {
  const result = await ingestTranscript(input);
  if (result.ok) revalidatePath("/app/intelligence");
  return result;
}

export async function uploadRecordingAction(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return {
      ok: false as const,
      error: { code: "VALIDATION", message: "Selecciona un archivo.", field: "file" },
    };
  }
  // `uploadRecording` valida tipo, tamano y contenido con su propio esquema de
  // Zod; aqui solo cruzamos el borde de FormData, donde el tipo MIME llega como
  // string. La validacion real sigue estando del lado del servidor.
  const chatLog = formData.get("chatLog");
  const result = await uploadRecording({
    file: file as unknown as Parameters<typeof uploadRecording>[0]["file"],
    chatLog: typeof chatLog === "string" && chatLog.trim() ? chatLog : undefined,
  });
  if (result.ok) revalidatePath("/app/intelligence");
  return result;
}
