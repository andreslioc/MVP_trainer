import { randomBytes, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../db/client.ts";
import { liveRecordings } from "../../db/schema.ts";
import { createAdminSupabaseClient, type AdvisorRole, requireRole } from "../../lib/auth.ts";
import { env } from "../../lib/env.ts";
import { MAX_RECORDING_BYTES, RECORDING_MIME_EXTENSIONS } from "../../lib/recordings.ts";
import { enqueueTranscription, type DeepgramConfig } from "./transcription.ts";

const recordingFileSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(Object.keys(RECORDING_MIME_EXTENSIONS) as [keyof typeof RECORDING_MIME_EXTENSIONS]),
  size: z.number().int().positive().max(MAX_RECORDING_BYTES),
  arrayBuffer: z.function(),
});

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
  input: { file: RecordingFile },
  options: UploadRecordingDependencies = {},
) {
  const authorization = await (options.authorize ?? requireRole)("asesor");
  if (!authorization.ok) return authorization;
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
  const storagePath = `${authorization.data.id}/${recordingId}.${RECORDING_MIME_EXTENSIONS[parsed.data.type]}`;
  const createdAt = (options.now ?? (() => new Date()))();
  const expiresAt = new Date(
    createdAt.getTime() + (options.retentionDays ?? env.RECORDING_RETENTION_DAYS) * 86_400_000,
  );

  try {
    const body = (await parsed.data.arrayBuffer()) as ArrayBuffer;
    const uploaded = await storage.upload(storagePath, body, {
      contentType: parsed.data.type,
      upsert: false,
    });
    if (uploaded.error) {
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
          callbackToken,
          createdAt,
          expiresAt,
        })
        .returning();
      if (!created) throw new Error("No se creó la grabación.");
      recording = created;
    } catch {
      await storage.remove([storagePath]);
      throw new Error("No se creó la grabación.");
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
  } catch {
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudo procesar la grabación." },
    };
  }
}
