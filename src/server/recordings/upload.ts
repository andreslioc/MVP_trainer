/**
 * Subida de una grabacion en dos pasos: preparar y registrar.
 *
 * El archivo NO pasa por el servidor de la app. Vercel corta cualquier cuerpo
 * de peticion sobre ~4,5 MB antes de que el codigo corra, y eso no se sube con
 * `bodySizeLimit`: es un limite de la plataforma. Un audio de live comprimido
 * ronda los 17 MB, asi que mandarlo por una server action es imposible alla.
 *
 * En su lugar: el servidor firma una URL de subida, el navegador manda el
 * archivo directo a Storage —sin credenciales, el token va en la URL— y despues
 * le avisa al servidor. Verificado contra Supabase real: 200 con 2 MB.
 *
 * Tampoco se comprime aqui. Comprimir exige ffmpeg y en Vercel no existe, asi
 * que la subida entera fallaba con FFMPEG_MISSING para cualquier archivo sobre
 * el tope de transcripcion. Quien decide si hace falta comprimir es el
 * proveedor, al transcribir, y Deepgram admite 2 GB sin comprimir nada.
 */

import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { db } from "../../db/client.ts";
import { type AdvisorRole, requireRole } from "../../lib/auth.ts";
import { env } from "../../lib/env.ts";
import { logFailure } from "../../lib/log.ts";
import { MAX_RECORDING_BYTES, RECORDING_MIME_EXTENSIONS } from "../../lib/recordings.ts";
import type { enqueueTranscription, DeepgramConfig } from "./transcription.ts";

const prepareSchema = z
  .object({
    contentType: z.enum(
      Object.keys(RECORDING_MIME_EXTENSIONS) as [keyof typeof RECORDING_MIME_EXTENSIONS],
    ),
    sizeBytes: z.number().int().positive().max(MAX_RECORDING_BYTES),
  })
  .strict();

type RecordingDatabase = Pick<typeof db, "insert" | "update">;
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };

/** Lo minimo del storage que estas dos funciones usan. */
export type RecordingStorage = {
  createSignedUploadUrl: (
    path: string,
  ) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
  createSignedUrl: (
    path: string,
    expiresIn: number,
  ) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
  exists: (path: string) => Promise<boolean>;
  remove: (paths: string[]) => Promise<unknown>;
};

export type UploadRecordingDependencies = {
  authorize?: (role: AdvisorRole) => Promise<AuthorizationResult>;
  database?: RecordingDatabase;
  storage?: RecordingStorage;
  bucket?: string;
  retentionDays?: number;
  maxBytes?: number;
  provider?: "deepgram" | "groq";
  now?: () => Date;
  randomId?: () => string;
  randomToken?: () => string;
  enqueue?: typeof enqueueTranscription;
  deepgramConfig?: DeepgramConfig;
};

function bucketOf(options: UploadRecordingDependencies) {
  const bucket = options.bucket ?? env.SUPABASE_RECORDINGS_BUCKET;
  return bucket
    ? { ok: true as const, bucket }
    : {
        ok: false as const,
        error: { code: "INTERNAL", message: "Storage no está configurado." },
      };
}

/**
 * Paso 1: firma una URL para que el navegador suba el archivo por su cuenta.
 *
 * El tope se revisa AQUI, antes de subir nada. El plan de Supabase rechaza el
 * objeto al final de la subida, asi que sin esta revision la asesora esperaba a
 * que se subieran 100 MB para recibir un error.
 */
export async function prepareRecordingUpload(
  input: unknown,
  options: UploadRecordingDependencies = {},
) {
  const authorization = await (options.authorize ?? requireRole)("asesor");
  if (!authorization.ok) return authorization;

  const parsed = prepareSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: {
        code: "VALIDATION",
        message: "Sube un audio o video válido.",
        field: "file",
      },
    };
  }

  const limit = options.maxBytes ?? env.SUPABASE_MAX_UPLOAD_BYTES;
  if (parsed.data.sizeBytes > limit) {
    return {
      ok: false as const,
      error: {
        code: "TOO_LARGE",
        message: `El archivo pesa más de ${Math.round(limit / (1024 * 1024))} MB. Sube el audio comprimido del live, no el video.`,
        field: "file",
      },
    };
  }

  const resolved = bucketOf(options);
  if (!resolved.ok) return resolved;

  const recordingId = (options.randomId ?? randomUUID)();
  const extension = RECORDING_MIME_EXTENSIONS[parsed.data.contentType];
  const storagePath = `${authorization.data.id}/${recordingId}.${extension}`;
  const { defaultStorageFor } = await import("./storage.ts");
  const storage = options.storage ?? defaultStorageFor(resolved.bucket);

  const signed = await storage.createSignedUploadUrl(storagePath);
  if (signed.error || !signed.data) {
    logFailure("prepareRecordingUpload", signed.error?.message ?? "sin URL firmada");
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudo preparar la subida." },
    };
  }

  return {
    ok: true as const,
    data: { recordingId, storagePath, uploadUrl: signed.data.signedUrl },
  };
}
