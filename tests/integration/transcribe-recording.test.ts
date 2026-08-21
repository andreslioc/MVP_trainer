import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import { advisors, liveRecordings, type recordingStatus } from "../../src/db/schema.ts";
import { transcribeRecording } from "../../src/server/recordings/transcribe-now.ts";

const connection = openDirectDatabase("test");
const advisorId = randomUUID();
const otherAdvisorId = randomUUID();
const authorize = async () => ({
  ok: true as const,
  data: { id: advisorId, role: "asesor" as const },
});

type Status = (typeof recordingStatus.enumValues)[number];

async function createRecording(status: Status, owner = advisorId, path?: string) {
  const [recording] = await connection.db
    .insert(liveRecordings)
    .values({
      advisorId: owner,
      storagePath: path ?? `${owner}/${randomUUID()}.mp3`,
      status,
      callbackToken: randomUUID(),
      expiresAt: new Date("2026-12-01T00:00:00.000Z"),
    })
    .returning();
  if (!recording) throw new Error("No se creó el fixture de grabación.");
  return recording;
}

const removed: string[][] = [];

const storage = {
  download: async () => ({
    data: new Blob([new Uint8Array(16)], { type: "audio/mpeg" }),
    error: null,
  }),
  remove: async (paths: string[]) => {
    removed.push(paths);
    return {};
  },
};

const transcribeOk = async () => ({
  ok: true as const,
  data: { transcript: "[0s] [Speaker 0] Hola, hoy vemos la creatina.", durationS: 61 },
});

const deps = { authorize, database: connection.db, storage, bucket: "test-bucket" };

beforeAll(async () => {
  await connection.db.insert(advisors).values([
    { id: advisorId, email: `${advisorId}@transcribe.test`, displayName: "Dueña" },
    { id: otherAdvisorId, email: `${otherAdvisorId}@transcribe.test`, displayName: "Otra" },
  ]);
});

afterAll(async () => {
  for (const id of [advisorId, otherAdvisorId]) {
    await connection.db.delete(liveRecordings).where(eq(liveRecordings.advisorId, id));
    await connection.db.delete(advisors).where(eq(advisors.id, id));
  }
  await connection.close();
});

describe("transcribeRecording", () => {
  it("borra el audio de Storage cuando la transcripción sale bien", async () => {
    // El activo es la transcripción; el original sigue en el computador de la
    // asesora. Guardar 90 días de audio llena el bucket y conserva PII de
    // clientas que ya no hace falta.
    removed.length = 0;
    const recording = await createRecording("transcribing");
    const result = await transcribeRecording(recording.id, {
      transcribe: transcribeOk,
      authorize: async () => ({ ok: true, data: { id: advisorId, role: "asesor" } }),
      database: connection.db,
      storage,
      bucket: "live-recordings",
    });

    expect(result.ok).toBe(true);
    expect(removed).toContainEqual([recording.storagePath]);
  });

  it("deja lista para analizar una grabación recién subida", async () => {
    const recording = await createRecording("uploaded");

    const result = await transcribeRecording(recording.id, { ...deps, transcribe: transcribeOk });

    expect(result.ok).toBe(true);
    const [stored] = await connection.db
      .select()
      .from(liveRecordings)
      .where(eq(liveRecordings.id, recording.id));
    expect(stored?.status).toBe("transcribed");
    expect(stored?.transcript).toContain("[Speaker 0]");
    expect(stored?.durationS).toBe(61);
  });

  it("rescata una grabación varada esperando un callback que nunca llega", async () => {
    const recording = await createRecording("transcribing");

    const result = await transcribeRecording(recording.id, { ...deps, transcribe: transcribeOk });

    expect(result.ok).toBe(true);
    const [stored] = await connection.db
      .select()
      .from(liveRecordings)
      .where(eq(liveRecordings.id, recording.id));
    expect(stored?.status).toBe("transcribed");
  });

  it("permite reintentar una que falló antes", async () => {
    const recording = await createRecording("failed");

    const result = await transcribeRecording(recording.id, { ...deps, transcribe: transcribeOk });

    expect(result.ok).toBe(true);
  });

  it("no vuelve a transcribir una que ya tiene texto", async () => {
    const recording = await createRecording("transcribed");

    const result = await transcribeRecording(recording.id, { ...deps, transcribe: transcribeOk });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFLICT");
  });

  it("no intenta transcribir una transcripción pegada a mano: no hay audio", async () => {
    const recording = await createRecording("uploaded", advisorId, `manual/${randomUUID()}.txt`);

    const result = await transcribeRecording(recording.id, { ...deps, transcribe: transcribeOk });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFLICT");
    const [stored] = await connection.db
      .select()
      .from(liveRecordings)
      .where(eq(liveRecordings.id, recording.id));
    expect(stored?.status).toBe("uploaded");
  });

  it("deja la grabación en failed cuando el proveedor no responde, no varada en transcribing", async () => {
    const recording = await createRecording("uploaded");

    const result = await transcribeRecording(recording.id, {
      ...deps,
      transcribe: async () => ({
        ok: false as const,
        error: { code: "PROVIDER_UNAVAILABLE", message: "caído" },
      }),
    });

    expect(result.ok).toBe(false);
    const [stored] = await connection.db
      .select()
      .from(liveRecordings)
      .where(eq(liveRecordings.id, recording.id));
    expect(stored?.status).toBe("failed");
  });

  it("no toca la grabación de otra asesora", async () => {
    const ajena = await createRecording("uploaded", otherAdvisorId);

    const result = await transcribeRecording(ajena.id, { ...deps, transcribe: transcribeOk });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
    const [stored] = await connection.db
      .select()
      .from(liveRecordings)
      .where(eq(liveRecordings.id, ajena.id));
    expect(stored?.status).toBe("uploaded");
  });
});
