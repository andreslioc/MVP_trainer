import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import { advisors, liveRecordings } from "../../src/db/schema.ts";
import { registerRecording } from "../../src/server/recordings/register.ts";
import {
  prepareRecordingUpload,
  type RecordingStorage,
} from "../../src/server/recordings/upload.ts";

const connection = openDirectDatabase("test");
const supabaseConnection = openDirectDatabase("supabase");
const advisorId = randomUUID();
const recordingId = randomUUID();
const now = new Date("2026-08-18T15:00:00.000Z");
const callbackToken = "a".repeat(64);

beforeAll(async () => {
  await connection.db.insert(advisors).values({
    id: advisorId,
    email: `${advisorId}@recording-upload.test`,
    displayName: "Recording Owner",
  });
});

afterAll(async () => {
  await connection.db.delete(liveRecordings).where(eq(liveRecordings.advisorId, advisorId));
  await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
  await connection.close();
  await supabaseConnection.close();
});

/** Doble del storage: por defecto todo sale bien y el objeto existe. */
function storageDouble(overrides: Partial<RecordingStorage>): RecordingStorage {
  return {
    createSignedUploadUrl: async () => ({
      data: { signedUrl: "https://storage.test/upload?token=abc" },
      error: null,
    }),
    createSignedUrl: async () => ({
      data: { signedUrl: "https://storage.test/signed" },
      error: null,
    }),
    exists: async () => true,
    remove: async () => ({}),
    ...overrides,
  };
}

describe("recording upload", () => {
  it("keeps the recordings bucket private with owner-scoped Storage policies", async () => {
    const buckets = await supabaseConnection.db.execute<{ id: string; public: boolean }>(sql`
      select id, public from storage.buckets where id = 'live-recordings'
    `);
    const policies = await supabaseConnection.db.execute<{
      policyname: string;
      cmd: string;
      qual: string | null;
      with_check: string | null;
    }>(sql`
      select policyname, cmd, qual, with_check
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname like 'recordings_owner_%'
      order by policyname
    `);

    expect(buckets).toEqual([{ id: "live-recordings", public: false }]);
    expect(policies.map(({ policyname, cmd }) => ({ policyname, cmd }))).toEqual([
      { policyname: "recordings_owner_delete", cmd: "DELETE" },
      { policyname: "recordings_owner_insert", cmd: "INSERT" },
      { policyname: "recordings_owner_select", cmd: "SELECT" },
    ]);
    for (const policy of policies) {
      expect(`${policy.qual ?? ""} ${policy.with_check ?? ""}`).toContain("foldername(name)");
      expect(`${policy.qual ?? ""} ${policy.with_check ?? ""}`).toContain("auth.uid()");
    }
  });

  it("firma una URL de subida con la ruta de su dueña", async () => {
    // El archivo NO pasa por el servidor: Vercel corta los cuerpos sobre 4,5 MB
    // y un audio de live comprimido ronda los 17 MB.
    const createSignedUploadUrl = vi.fn(async () => ({
      data: { signedUrl: "https://storage.test/upload?token=abc" },
      error: null,
    }));

    const result = await prepareRecordingUpload(
      { contentType: "audio/mpeg", sizeBytes: 17_000_000 },
      {
        authorize: async () => ({ ok: true, data: { id: advisorId, role: "asesor" } }),
        storage: storageDouble({ createSignedUploadUrl }),
        bucket: "live-recordings",
        randomId: () => recordingId,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.storagePath).toBe(`${advisorId}/${recordingId}.mp3`);
    expect(result.data.uploadUrl).toContain("token=");
    expect(createSignedUploadUrl).toHaveBeenCalledWith(`${advisorId}/${recordingId}.mp3`);
  });

  it("rechaza un archivo sobre el tope ANTES de que se suba", async () => {
    // Supabase lo rechaza al final de la subida: sin esta revision la asesora
    // espera a que suban 100 MB para recibir el error.
    const createSignedUploadUrl = vi.fn();
    const result = await prepareRecordingUpload(
      { contentType: "audio/mpeg", sizeBytes: 60 * 1024 * 1024 },
      {
        authorize: async () => ({ ok: true, data: { id: advisorId, role: "asesor" } }),
        storage: storageDouble({ createSignedUploadUrl }),
        bucket: "live-recordings",
        maxBytes: 50 * 1024 * 1024,
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("TOO_LARGE");
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("registra la grabación, crea la retención y encola una sola vez", async () => {
    const enqueue = vi.fn(async () => ({
      ok: true as const,
      data: { requestId: "deepgram-request-1" },
    }));
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: "https://storage.test/private-signed-url" },
      error: null,
    }));

    const result = await registerRecording(
      { recordingId, storagePath: `${advisorId}/${recordingId}.mp3` },
      {
        authorize: async () => ({ ok: true, data: { id: advisorId, role: "asesor" } }),
        database: connection.db,
        storage: storageDouble({ createSignedUrl }),
        bucket: "live-recordings",
        retentionDays: 90,
        now: () => now,
        randomToken: () => callbackToken,
        enqueue,
        provider: "deepgram",
      },
    );

    expect(result.ok).toBe(true);
    expect(enqueue).toHaveBeenCalledWith(
      { audioUrl: "https://storage.test/private-signed-url", callbackToken },
      { config: undefined },
    );
    expect(enqueue).toHaveBeenCalledTimes(1);

    const [persisted] = await connection.db
      .select()
      .from(liveRecordings)
      .where(eq(liveRecordings.id, recordingId));
    expect(persisted).toMatchObject({
      advisorId,
      storagePath: `${advisorId}/${recordingId}.mp3`,
      status: "transcribing",
      providerRequestId: "deepgram-request-1",
      expiresAt: new Date("2026-11-16T15:00:00.000Z"),
    });
    // Nula a proposito: medirla exigia ffprobe, que no existe en Vercel. La
    // reporta el proveedor al transcribir.
    expect(persisted?.durationS).toBeNull();
  });

  it("no registra nada si el archivo no llegó a Storage", async () => {
    // Un navegador que se cierra a mitad de la subida dejaba una grabación en
    // la lista apuntando a un archivo que no existe.
    const otro = randomUUID();
    const result = await registerRecording(
      { recordingId: otro, storagePath: `${advisorId}/${otro}.mp3` },
      {
        authorize: async () => ({ ok: true, data: { id: advisorId, role: "asesor" } }),
        database: connection.db,
        storage: storageDouble({ exists: async () => false }),
        bucket: "live-recordings",
        provider: "groq",
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_UPLOADED");

    const rows = await connection.db
      .select()
      .from(liveRecordings)
      .where(eq(liveRecordings.id, otro));
    expect(rows).toHaveLength(0);
  });

  it("no deja registrar un archivo de otra asesora", async () => {
    // La ruta la arma el paso 1 con el id al frente. Sin esta revisión, pasar
    // la ruta de otra asesora registraba su grabación como propia.
    const otro = randomUUID();
    const result = await registerRecording(
      { recordingId: otro, storagePath: `${randomUUID()}/${otro}.mp3` },
      {
        authorize: async () => ({ ok: true, data: { id: advisorId, role: "asesor" } }),
        database: connection.db,
        storage: storageDouble({}),
        bucket: "live-recordings",
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FORBIDDEN");
  });

  it("con un proveedor sincrono no encola nada y queda lista para transcribir", async () => {
    const enqueue = vi.fn();
    const otro = randomUUID();
    const result = await registerRecording(
      { recordingId: otro, storagePath: `${advisorId}/${otro}.ogg` },
      {
        authorize: async () => ({ ok: true, data: { id: advisorId, role: "asesor" } }),
        database: connection.db,
        storage: storageDouble({}),
        bucket: "live-recordings",
        enqueue,
        provider: "groq",
      },
    );

    expect(result.ok).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
    if (!result.ok) return;
    expect(result.data.status).toBe("uploaded");
  });

  it("guarda el chat y el nombre que viajan junto al audio", async () => {
    const otro = randomUUID();
    const result = await registerRecording(
      {
        recordingId: otro,
        storagePath: `${advisorId}/${otro}.ogg`,
        chatLog: "[00:01:00] @viewer: a como la creatina",
        title: "Live del jueves",
      },
      {
        authorize: async () => ({ ok: true, data: { id: advisorId, role: "asesor" } }),
        database: connection.db,
        storage: storageDouble({}),
        bucket: "live-recordings",
        provider: "groq",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.chatLog).toContain("creatina");
    expect(result.data.title).toBe("Live del jueves");
  });

  it("sin chat guarda null, no una cadena vacía que el análisis leería como chat", async () => {
    const otro = randomUUID();
    const result = await registerRecording(
      { recordingId: otro, storagePath: `${advisorId}/${otro}.ogg` },
      {
        authorize: async () => ({ ok: true, data: { id: advisorId, role: "asesor" } }),
        database: connection.db,
        storage: storageDouble({}),
        bucket: "live-recordings",
        provider: "groq",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.chatLog).toBeNull();
  });

  it("rechaza un nombre desmedido sin registrar nada", async () => {
    const otro = randomUUID();
    const result = await registerRecording(
      {
        recordingId: otro,
        storagePath: `${advisorId}/${otro}.ogg`,
        title: "x".repeat(200),
      },
      {
        authorize: async () => ({ ok: true, data: { id: advisorId, role: "asesor" } }),
        database: connection.db,
        storage: storageDouble({}),
        bucket: "live-recordings",
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION");
  });
});
