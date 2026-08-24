"use server";

import { revalidatePath } from "next/cache";

import { promoteInsight } from "../../../../server/insights.ts";
import { analyzeRecording } from "../../../../server/recordings/analyze.ts";
import { transcribeRecording } from "../../../../server/recordings/transcribe-now.ts";
import { getRecordingTranscript } from "../../../../server/recordings/transcript-view.ts";
import { ingestTranscript } from "../../../../server/recordings/ingest.ts";
import { deleteRecording } from "../../../../server/recordings/delete.ts";
import { registerRecording } from "../../../../server/recordings/register.ts";
import { prepareRecordingUpload } from "../../../../server/recordings/upload.ts";

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

/** Lectura, no mutacion: no revalida nada. */
export async function getRecordingTranscriptAction(recordingId: string) {
  return getRecordingTranscript(recordingId);
}

export async function promoteInsightAction(insightId: string) {
  const result = await promoteInsight(insightId);
  if (result.ok) revalidatePath("/app/intelligence");
  return result;
}

export async function ingestTranscriptAction(input: {
  transcript: string;
  chatLog?: string;
  title?: string;
  durationS?: number;
}) {
  const result = await ingestTranscript(input);
  if (result.ok) revalidatePath("/app/intelligence");
  return result;
}

/**
 * Paso 1: pide la URL firmada. Peticion diminuta —solo tipo y tamano—, asi que
 * pasa sin problema por el tope de cuerpo de Vercel.
 */
export async function prepareRecordingUploadAction(input: {
  contentType: string;
  sizeBytes: number;
}) {
  return prepareRecordingUpload(input);
}

/** Paso 2: el navegador ya subio el archivo; se registra la grabacion. */
export async function registerRecordingAction(input: {
  recordingId: string;
  storagePath: string;
  chatLog?: string;
  title?: string;
  durationS?: number;
}) {
  const result = await registerRecording(input);
  if (result.ok) revalidatePath("/app/intelligence");
  return result;
}

export async function deleteRecordingAction(recordingId: string) {
  const result = await deleteRecording(recordingId);
  if (result.ok) revalidatePath("/app/intelligence");
  return result;
}
