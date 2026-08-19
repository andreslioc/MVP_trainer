import { randomBytes, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../db/client.ts";
import { liveRecordings } from "../../db/schema.ts";
import { createAdminSupabaseClient, type AdvisorRole, requireRole } from "../../lib/auth.ts";
import { env } from "../../lib/env.ts";
import { logFailure } from "../../lib/log.ts";
import { MAX_RECORDING_BYTES, RECORDING_MIME_EXTENSIONS } from "../../lib/recordings.ts";
import { compressForTranscription } from "./compress.ts";
import { enqueueTranscription, type DeepgramConfig } from "./transcription.ts";

const recordingFileSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(Object.keys(RECORDING_MIME_EXTENSIONS) as [keyof typeof RECORDING_MIME_EXTENSIONS]),
  size: z.number().int().positive().max(MAX_RECORDING_BYTES),
  arrayBuffer: z.function(),
});

const chatLogSchema = z.string().trim().min(1).max(200_000).optional();

type RecordingFile = z.infer<typeof recordingFileSchema>;
type RecordingDatabase = Pick<typeof db, "insert" | "update">;
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };
type RecordingStorage = {
  upload: (
    path: string,
    body: ArrayBuffer,
    options: { contentType: string; upsert: false },
  ) => Promise<{ error: { message: string } | null }>;
  createSignedUrl: (
    path: string,
    expiresIn: number,
  ) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
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

function defaultStorage(bucket: string): RecordingStorage {
  const storage = createAdminSupabaseClient().storage.from(bucket);
  return {
    upload: (path, body, options) => storage.upload(path, body, options),
    createSignedUrl: (path, expiresIn) => storage.createSignedUrl(path, expiresIn),
    remove: (paths) => storage.remove(paths),
  };
}

export async function uploadRecording(
  input: { file: RecordingFile; chatLog?: string },
  options: UploadRecordingDependencies = {},
) {
  const authorization = await (options.authorize ?? requireRole)("asesor");
  if (!authorization.ok) return authorization;
  // El chat se valida aparte y su fallo no invalida el archivo: viene vacio la
  // mayoria de las veces y perder la subida entera por un chat mal pegado seria
  // desproporcionado.
  const parsedChatLog = chatLogSchema.safeParse(input.chatLog);
  if (!parsedChatLog.success) {
    return {
      ok: false as const,
      error: {
        code: "VALIDATION",
        message: "El chat del live es demasiado largo.",
        field: "chatLog",
      },
    };
  }

  const parsed = recordingFileSchema.safeParse(input.file);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: {
        code: "VALIDATION",
        message: "Sube un audio o video válido de máximo 200 MB.",
        field: "file",
      },
    };
  }

  const bucket = options.bucket ?? env.SUPABASE_RECORDINGS_BUCKET;
  if (!bucket) {
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "Storage no está configurado." },
    };
  }
  const database = options.database ?? db;
  const storage = options.storage ?? defaultStorage(bucket);
  const recordingId = (options.randomId ?? randomUUID)();
  const callbackToken = (options.randomToken ?? (() => randomBytes(32).toString("hex")))();
  // La extension se decide despues de comprimir: una ruta .mp4 que contiene ogg
  // es una mentira que rompe a quien lo descargue por el nombre.
  const extension = RECORDING_MIME_EXTENSIONS[parsed.data.type];
  const createdAt = (options.now ?? (() => new Date()))();
  let storagePath = `${authorization.data.id}/${recordingId}.${extension}`;
  const expiresAt = new Date(
    createdAt.getTime() + (options.retentionDays ?? env.RECORDING_RETENTION_DAYS) * 86_400_000,
  );

  try {
    // Comprimir aqui y no al transcribir. El audio original de un live de dos
    // horas ronda los 112 MB y baja a 22 en 22 segundos; pagar eso una vez al
    // subir evita repetirlo en cada transcripcion y, sobre todo, evita guardar
    // cinco veces mas bytes durante los 90 dias de retencion. Lo que se
    // conserva es lo unico que el producto usa: la voz.
    // Se leen los bytes del File ORIGINAL, no del objeto que construye Zod.
    // `File.arrayBuffer` exige que `this` sea el Blob; invocarlo desde la copia
    // parseada lo desacopla y Node responde ERR_INVALID_THIS. La validacion
    // sigue viniendo de `parsed`, que es para lo que existe.
    const original = (await input.file.arrayBuffer()) as ArrayBuffer;
    const prepared = await compressForTranscription(
      { audio: original, contentType: parsed.data.type },
      // bestEffort: quedarse por encima del tope no justifica rechazar la
      // subida. El archivo comprimido ya es una fraccion del original y el
      // proveedor vuelve a mirarlo al transcribir, que es donde el limite
      // manda de verdad.
      { maxBytes: options.maxBytes ?? env.TRANSCRIPTION_MAX_BYTES, bestEffort: true },
    );
    if (!prepared.ok) {
      return { ok: false as const, error: prepared.error };
    }

    if (prepared.data.compressed) storagePath = `${authorization.data.id}/${recordingId}.ogg`;

    const body = prepared.data.audio;
    const uploaded = await storage.upload(storagePath, body, {
      contentType: prepared.data.contentType,
      upsert: false,
    });
    if (uploaded.error) {
      logFailure("uploadRecording/storage", uploaded.error.message);
      return {
        ok: false as const,
        error: { code: "INTERNAL", message: "No se pudo cargar la grabación." },
      };
    }

    let recording: typeof liveRecordings.$inferSelect;
    try {
      const [created] = await database
        .insert(liveRecordings)
        .values({
          id: recordingId,
          advisorId: authorization.data.id,
          storagePath,
          chatLog: parsedChatLog.data ?? null,
          callbackToken,
          createdAt,
          expiresAt,
        })
        .returning();
      if (!created) throw new Error("No se creó la grabación.");
      recording = created;
    } catch (error) {
      // El objeto ya esta en Storage: si la fila no se crea hay que retirarlo o
      // queda huerfano, sin nada que lo referencie ni lo expire.
      logFailure("uploadRecording/insert", error);
      await storage.remove([storagePath]);
      throw new Error("No se creó la grabación.");
    }

    // Encolar solo tiene sentido con el camino asincrono de Deepgram, que
    // devuelve el resultado por callback. Con un proveedor sincrono no hay nada
    // que encolar: la grabacion queda en `uploaded` y la asesora dispara la
    // transcripcion cuando quiera. Llamar a Deepgram igual gastaba una peticion,
    // exigia su llave, y dejaba la fila en `transcribing` esperando un callback
    // que nadie iba a mandar.
    if ((options.provider ?? env.TRANSCRIPTION_PROVIDER) !== "deepgram") {
      return { ok: true as const, data: recording };
    }

    const signed = await storage.createSignedUrl(storagePath, 60 * 60);
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

    const [transcribing] = await database
      .update(liveRecordings)
      .set({ status: "transcribing" })
      .where(
        and(
          eq(liveRecordings.id, recording.id),
          eq(liveRecordings.advisorId, authorization.data.id),
          eq(liveRecordings.status, "uploaded"),
        ),
      )
      .returning();
    if (!transcribing) throw new Error("La grabación cambió de estado.");

    const queued = await (options.enqueue ?? enqueueTranscription)(
      { audioUrl: signed.data.signedUrl, callbackToken },
      { config: options.deepgramConfig },
    );
    if (!queued.ok) {
      await database
        .update(liveRecordings)
        .set({ status: "failed" })
        .where(
          and(
            eq(liveRecordings.id, recording.id),
            eq(liveRecordings.advisorId, authorization.data.id),
            eq(liveRecordings.status, "transcribing"),
          ),
        );
      return queued;
    }

    const [updated] = await database
      .update(liveRecordings)
      .set({ providerRequestId: queued.data.requestId })
      .where(
        and(
          eq(liveRecordings.id, recording.id),
          eq(liveRecordings.advisorId, authorization.data.id),
        ),
      )
      .returning();
    return { ok: true as const, data: updated ?? transcribing };
  } catch (error) {
    // Un catch que descarta la causa convierte cualquier fallo en el mismo
    // mensaje opaco, y deja la unica pista posible en la basura. El mensaje al
    // usuario sigue siendo generico —no le sirve el detalle y puede filtrar
    // rutas—, pero el servidor tiene que poder decir que paso.
    logFailure("uploadRecording", error);
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudo procesar la grabación." },
    };
  }
}
