/**
 * Paso 2 de la subida: registrar la grabacion que el navegador ya subio.
 *
 * Verifica que el objeto exista antes de crear la fila. Sin eso, un navegador
 * que se cierra a mitad de la subida deja una grabacion en la lista apuntando a
 * un archivo que no esta, y el fallo aparece recien al transcribir.
 */

import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../db/client.ts";
import { liveRecordings } from "../../db/schema.ts";
import { requireRole } from "../../lib/auth.ts";
import { env } from "../../lib/env.ts";
import { logFailure } from "../../lib/log.ts";
import { enqueueTranscription } from "./transcription.ts";
import type { UploadRecordingDependencies } from "./upload.ts";

const registerSchema = z
  .object({
    recordingId: z.uuid(),
    storagePath: z.string().trim().min(1).max(400),
    chatLog: z.string().trim().min(1).max(200_000).optional(),
    title: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export async function registerRecording(input: unknown, options: UploadRecordingDependencies = {}) {
  const authorization = await (options.authorize ?? requireRole)("asesor");
  if (!authorization.ok) return authorization;

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: {
        code: "VALIDATION",
        message: z.prettifyError(parsed.error),
        field: parsed.error.issues[0]?.path[0]?.toString(),
      },
    };
  }

  // La ruta la arma el paso 1 con el id de la asesora al frente. Verificarlo
  // aqui impide que alguien registre un objeto de otra asesora pasando su ruta.
  if (!parsed.data.storagePath.startsWith(`${authorization.data.id}/`)) {
    return {
      ok: false as const,
      error: { code: "FORBIDDEN", message: "Esa grabación no es tuya." },
    };
  }

  const bucket = options.bucket ?? env.SUPABASE_RECORDINGS_BUCKET;
  if (!bucket) {
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "Storage no está configurado." },
    };
  }

  const { defaultStorageFor } = await import("./storage.ts");
  const storage = options.storage ?? defaultStorageFor(bucket);
  const database = options.database ?? db;

  if (!(await storage.exists(parsed.data.storagePath))) {
    return {
      ok: false as const,
      error: { code: "NOT_UPLOADED", message: "El archivo no llegó completo. Vuelve a subirlo." },
    };
  }

  const createdAt = (options.now ?? (() => new Date()))();
  const expiresAt = new Date(
    createdAt.getTime() + (options.retentionDays ?? env.RECORDING_RETENTION_DAYS) * 86_400_000,
  );
  const callbackToken = (options.randomToken ?? (() => randomBytes(32).toString("hex")))();

  let recording: typeof liveRecordings.$inferSelect;
  try {
    const [created] = await database
      .insert(liveRecordings)
      .values({
        id: parsed.data.recordingId,
        advisorId: authorization.data.id,
        storagePath: parsed.data.storagePath,
        title: parsed.data.title ?? null,
        chatLog: parsed.data.chatLog ?? null,
        // Nula a proposito: medirla exigia ffprobe, que no existe en Vercel. La
        // reporta el proveedor al transcribir, que es quien de verdad la sabe.
        durationS: null,
        callbackToken,
        createdAt,
        expiresAt,
      })
      .returning();
    if (!created) throw new Error("No se creó la grabación.");
    recording = created;
  } catch (error) {
    logFailure("registerRecording/insert", error);
    await storage.remove([parsed.data.storagePath]);
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudo registrar la grabación." },
    };
  }

  // Encolar solo tiene sentido con el camino asincrono de Deepgram, que devuelve
  // el resultado por callback. Con un proveedor sincrono la grabacion queda en
  // `uploaded` y la asesora dispara la transcripcion cuando quiera.
  if ((options.provider ?? env.TRANSCRIPTION_PROVIDER) !== "deepgram") {
    return { ok: true as const, data: recording };
  }

  const signed = await storage.createSignedUrl(parsed.data.storagePath, 60 * 60);
  if (signed.error || !signed.data) {
    await database
      .update(liveRecordings)
      .set({ status: "failed" })
      .where(
        and(
          eq(liveRecordings.id, recording.id),
          eq(liveRecordings.advisorId, authorization.data.id),
        ),
      );
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudo preparar la transcripción." },
    };
  }

  const enqueue = options.enqueue ?? enqueueTranscription;
  const queued = await enqueue(
    { audioUrl: signed.data.signedUrl, callbackToken },
    { config: options.deepgramConfig },
  );
  if (!queued.ok) {
    await database
      .update(liveRecordings)
      .set({ status: "failed" })
      .where(eq(liveRecordings.id, recording.id));
    return { ok: false as const, error: queued.error };
  }

  const [transcribing] = await database
    .update(liveRecordings)
    .set({ status: "transcribing", providerRequestId: queued.data.requestId ?? null })
    .where(eq(liveRecordings.id, recording.id))
    .returning();

  return { ok: true as const, data: transcribing ?? recording };
}
