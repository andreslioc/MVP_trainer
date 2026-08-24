/**
 * Borrado de una grabacion y todo lo que colgaba de ella.
 *
 * Existe porque probar deja rastro: cada intento suma una grabacion, sus
 * hallazgos y sus preguntas de chat, y sin una salida la lista se vuelve
 * ilegible en un dia.
 *
 * Las tablas hijas caen por `on delete cascade`, pero el objeto de Storage no:
 * ninguna base sabe de archivos. Se borra primero el archivo y despues la fila,
 * porque al reves un fallo a mitad deja el audio sin nada que lo referencie ni
 * lo expire, y ese archivo con PII de clientas se queda ahi para siempre.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../db/client.ts";
import { insights, liveRecordings } from "../../db/schema.ts";
import { type AdvisorRole, requireRole } from "../../lib/auth.ts";
import { env } from "../../lib/env.ts";
import { logFailure } from "../../lib/log.ts";

type DeleteDatabase = Pick<typeof db, "select" | "delete" | "transaction">;
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };

export type DeleteRecordingDependencies = {
  authorize?: (role: AdvisorRole) => Promise<AuthorizationResult>;
  database?: DeleteDatabase;
  storage?: { remove: (paths: string[]) => Promise<unknown> };
  bucket?: string;
};

export async function deleteRecording(
  recordingId: string,
  options: DeleteRecordingDependencies = {},
) {
  const authorize = options.authorize ?? requireRole;
  const database = options.database ?? db;

  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;

  const parsedId = z.uuid().safeParse(recordingId);
  if (!parsedId.success) {
    return {
      ok: false as const,
      error: { code: "VALIDATION", message: "El identificador no es válido." },
    };
  }

  try {
    // El filtro por `advisor_id` es explicito porque el servidor conecta
    // saltando RLS: sin el, cualquier id valido borraria la grabacion de otra.
    const [recording] = await database
      .select({ id: liveRecordings.id, storagePath: liveRecordings.storagePath })
      .from(liveRecordings)
      .where(
        and(
          eq(liveRecordings.id, parsedId.data),
          eq(liveRecordings.advisorId, authorization.data.id),
        ),
      )
      .limit(1);
    if (!recording) {
      return {
        ok: false as const,
        error: { code: "NOT_FOUND", message: "La grabación no existe." },
      };
    }

    // Las preguntas de practica que salieron de esta grabacion se conservan:
    // ya son material de entrenamiento por si mismas, y borrarlas castigaria a
    // la asesora por limpiar su lista. Solo se suelta el vinculo.
    const promoted = await database
      .select({ questionId: insights.promotedToQuestionId })
      .from(insights)
      .where(eq(insights.recordingId, recording.id));

    const { defaultStorageFor } = await import("./storage.ts");
    const bucket = options.bucket ?? env.SUPABASE_RECORDINGS_BUCKET;
    const storage = options.storage ?? (bucket ? defaultStorageFor(bucket) : null);
    if (storage) await storage.remove([recording.storagePath]).catch(() => null);

    await database.delete(liveRecordings).where(eq(liveRecordings.id, recording.id));

    return {
      ok: true as const,
      data: {
        keptQuestions: promoted.filter((row) => row.questionId !== null).length,
      },
    };
  } catch (error) {
    logFailure("deleteRecording", error);
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudo borrar la grabación." },
    };
  }
}
