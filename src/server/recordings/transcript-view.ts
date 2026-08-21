/**
 * Lectura de la transcripcion y el chat de una grabacion, para revisarlos a
 * mano.
 *
 * Va en su propia consulta y no en el listado a proposito: una transcripcion de
 * dos horas pesa 144 KB, y traer la de todas las grabaciones en cada carga de
 * la pantalla costaria mas que todo lo demas junto. Se pide cuando se abre.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../db/client.ts";
import { liveRecordings } from "../../db/schema.ts";
import { type AdvisorRole, requireRole } from "../../lib/auth.ts";
import { logFailure } from "../../lib/log.ts";

type TranscriptDatabase = Pick<typeof db, "select">;
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };

export type TranscriptViewDependencies = {
  authorize?: (role: AdvisorRole) => Promise<AuthorizationResult>;
  database?: TranscriptDatabase;
};

export async function getRecordingTranscript(
  recordingId: string,
  options: TranscriptViewDependencies = {},
) {
  const authorize = options.authorize ?? requireRole;
  const database = options.database ?? db;

  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;

  const parsedId = z.uuid().safeParse(recordingId);
  if (!parsedId.success) {
    return {
      ok: false as const,
      error: {
        code: "VALIDATION",
        message: "El identificador no es válido.",
        field: "recordingId",
      },
    };
  }

  try {
    // El filtro por `advisor_id` es explicito porque el servidor conecta
    // saltando RLS (§8): sin el, cualquier id valido leeria la transcripcion
    // de otra asesora, y una transcripcion trae PII de clientas.
    const [recording] = await database
      .select({
        title: liveRecordings.title,
        transcript: liveRecordings.transcript,
        chatLog: liveRecordings.chatLog,
        durationS: liveRecordings.durationS,
      })
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

    return { ok: true as const, data: recording };
  } catch (error) {
    logFailure("getRecordingTranscript", error);
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudo cargar la transcripción." },
    };
  }
}
