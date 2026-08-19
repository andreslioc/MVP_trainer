import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import type { RecordingMime } from "../../src/lib/recordings.ts";
import { advisors, liveRecordings } from "../../src/db/schema.ts";
import { uploadRecording } from "../../src/server/recordings/upload.ts";

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

/**
 * Doble fiel de un File del navegador.
 *
 * `File.arrayBuffer` es un metodo de Blob y exige que `this` sea el Blob. Un
 * doble escrito como `arrayBuffer: async () => bytes` no lo exige, y por eso
 * dejaba pasar codigo que invocaba el metodo desacoplado del objeto: en pruebas
 * funcionaba y contra un File real fallaba con ERR_INVALID_THIS.
 */
function fileLike<T extends RecordingMime>(bytes: ArrayBuffer, type: T, name: string) {
  const file = {
    name,
    type,
    size: bytes.byteLength,
    arrayBuffer(this: unknown) {
      if (this !== file) {
        throw new TypeError('Value of "this" must be of type Blob');
      }
      return Promise.resolve(bytes);
    },
  };
  return file;
}

/** WAV de tono: comprimible de verdad, sin arrastrar un fixture binario. */
function wav(seconds: number) {
  const rate = 16000;
  const frames = rate * seconds;
  const buffer = Buffer.alloc(44 + frames * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + frames * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(frames * 2, 40);
  for (let frame = 0; frame < frames; frame += 1) {
    buffer.writeInt16LE(
      Math.round(9000 * Math.sin((2 * Math.PI * 220 * frame) / rate)),
      44 + frame * 2,
    );
  }
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
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

  it("uses the private bucket path by owner, creates retention and queues once", async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: "https://storage.test/private-signed-url" },
      error: null,
    }));
    const remove = vi.fn(async () => ({}));
    const enqueue = vi.fn(async () => ({
      ok: true as const,
      data: { requestId: "deepgram-request-1" },
    }));
    const fileBytes = new Uint8Array([1, 2, 3]).buffer;

    const result = await uploadRecording(
      {
        file: fileLike(fileBytes, "audio/mpeg", "live.mp3"),
      },
      {
        authorize: async () => ({
          ok: true,
          data: { id: advisorId, role: "asesor" },
        }),
        database: connection.db,
        storage: { upload, createSignedUrl, remove },
        bucket: "live-recordings",
        retentionDays: 90,
        now: () => now,
        randomId: () => recordingId,
        randomToken: () => callbackToken,
        enqueue,
        // Explicito y no heredado del entorno: esta prueba describe el camino
        // de Deepgram, y dejarla depender de TRANSCRIPTION_PROVIDER la hacia
        // fallar en cuanto alguien configuraba Groq en su .env.local.
        provider: "deepgram",
      },
    );

    expect(result.ok).toBe(true);
    expect(upload).toHaveBeenCalledWith(`${advisorId}/${recordingId}.mp3`, fileBytes, {
      contentType: "audio/mpeg",
      upsert: false,
    });
    expect(createSignedUrl).toHaveBeenCalledWith(`${advisorId}/${recordingId}.mp3`, 3600);
    expect(enqueue).toHaveBeenCalledWith(
      { audioUrl: "https://storage.test/private-signed-url", callbackToken },
      { config: undefined },
    );
    expect(remove).not.toHaveBeenCalled();

    const [persisted] = await connection.db
      .select()
      .from(liveRecordings)
      .where(eq(liveRecordings.id, recordingId));
    expect(persisted).toMatchObject({
      advisorId,
      storagePath: `${advisorId}/${recordingId}.mp3`,
      status: "transcribing",
      providerRequestId: "deepgram-request-1",
      callbackToken,
      expiresAt: new Date("2026-11-16T15:00:00.000Z"),
    });
  });

  it("guarda el audio comprimido, no el original que llego", async () => {
    // El audio de un live llega en original: dos horas rondan los 112 MB y el
    // proveedor mas restrictivo admite 25. Lo que debe quedar en Storage —y
    // ocupar los 90 dias de retencion— es la version comprimida.
    const id = randomUUID();
    const upload = vi.fn(
      async (_path: string, _body: ArrayBuffer, _options: { contentType: string; upsert: false }) =>
        ({ error: null }) as { error: { message: string } | null },
    );
    const original = wav(20);

    const result = await uploadRecording(
      {
        file: fileLike(original, "audio/wav", "live.wav"),
      },
      {
        authorize: async () => ({ ok: true, data: { id: advisorId, role: "asesor" } }),
        database: connection.db,
        storage: {
          upload,
          createSignedUrl: async () => ({
            data: { signedUrl: "https://storage.test/firmada" },
            error: null,
          }),
          remove: async () => ({}),
        },
        bucket: "live-recordings",
        retentionDays: 90,
        now: () => now,
        randomId: () => id,
        randomToken: () => "b".repeat(64),
        enqueue: async () => ({ ok: true as const, data: { requestId: "req" } }),
        maxBytes: 64 * 1024,
      },
    );

    expect(result.ok).toBe(true);
    const [path, body, options] = upload.mock.calls[0] ?? [];
    expect(path).toBe(`${advisorId}/${id}.ogg`);
    expect(options.contentType).toBe("audio/ogg");
    expect(body.byteLength).toBeLessThan(original.byteLength);
    expect(body.byteLength).toBeLessThanOrEqual(64 * 1024);

    const [persisted] = await connection.db
      .select()
      .from(liveRecordings)
      .where(eq(liveRecordings.id, id));
    // La ruta debe nombrar lo que de verdad se guardo: un .wav que contiene ogg
    // rompe a quien lo descargue por el nombre.
    expect(persisted?.storagePath).toBe(`${advisorId}/${id}.ogg`);
  });

  it("no toca el audio que ya viene chico: recomprimir de gratis solo degrada", async () => {
    const id = randomUUID();
    const upload = vi.fn(
      async (_path: string, _body: ArrayBuffer, _options: { contentType: string; upsert: false }) =>
        ({ error: null }) as { error: { message: string } | null },
    );
    const original = wav(1);

    await uploadRecording(
      {
        file: fileLike(original, "audio/wav", "corto.wav"),
      },
      {
        authorize: async () => ({ ok: true, data: { id: advisorId, role: "asesor" } }),
        database: connection.db,
        storage: {
          upload,
          createSignedUrl: async () => ({
            data: { signedUrl: "https://storage.test/firmada" },
            error: null,
          }),
          remove: async () => ({}),
        },
        bucket: "live-recordings",
        retentionDays: 90,
        now: () => now,
        randomId: () => id,
        randomToken: () => "c".repeat(64),
        enqueue: async () => ({ ok: true as const, data: { requestId: "req" } }),
        maxBytes: 10 * 1024 * 1024,
      },
    );

    const [path, body, options] = upload.mock.calls[0] ?? [];
    expect(path).toBe(`${advisorId}/${id}.wav`);
    expect(options.contentType).toBe("audio/wav");
    expect(body).toBe(original);
  });

  it("con un proveedor sincrono no encola nada y deja la grabacion lista para transcribir", async () => {
    const id = randomUUID();
    const enqueue = vi.fn(async () => ({ ok: true as const, data: { requestId: "no-deberia" } }));
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: "https://storage.test/firmada" },
      error: null,
    }));

    const result = await uploadRecording(
      {
        file: fileLike(wav(1), "audio/wav", "live.wav"),
      },
      {
        authorize: async () => ({ ok: true, data: { id: advisorId, role: "asesor" } }),
        database: connection.db,
        storage: {
          upload: async () => ({ error: null }),
          createSignedUrl,
          remove: async () => ({}),
        },
        bucket: "live-recordings",
        retentionDays: 90,
        now: () => now,
        randomId: () => id,
        randomToken: () => "d".repeat(64),
        enqueue,
        provider: "groq",
      },
    );

    expect(result.ok).toBe(true);
    // Ni peticion a Deepgram ni URL firmada: no hay callback que esperar.
    expect(enqueue).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();

    const [persisted] = await connection.db
      .select()
      .from(liveRecordings)
      .where(eq(liveRecordings.id, id));
    // `uploaded` y no `transcribing`: nadie esta transcribiendo todavia, y
    // decir lo contrario dejaria una fila mintiendo para siempre.
    expect(persisted?.status).toBe("uploaded");
    expect(persisted?.providerRequestId).toBeNull();
  });
});
