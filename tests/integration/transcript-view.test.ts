import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import { advisors, liveRecordings } from "../../src/db/schema.ts";
import { getRecordingTranscript } from "../../src/server/recordings/transcript-view.ts";

const connection = openDirectDatabase("test");
const advisorId = randomUUID();
const otherAdvisorId = randomUUID();
const recordingId = randomUUID();
const ajenaId = randomUUID();

const authorize = async () => ({
  ok: true as const,
  data: { id: advisorId, role: "asesor" as const },
});

async function crear(id: string, dueno: string, transcript: string, chatLog: string | null) {
  await connection.db.insert(liveRecordings).values({
    id,
    advisorId: dueno,
    storagePath: `live-recordings/${id}.mp4`,
    status: "analyzed",
    transcript,
    chatLog,
    durationS: 2400,
    callbackToken: randomUUID(),
    expiresAt: new Date(Date.now() + 90 * 24 * 3_600_000),
  });
}

beforeAll(async () => {
  await connection.db.insert(advisors).values([
    {
      id: advisorId,
      email: `visor-${advisorId}@example.test`,
      displayName: "Visor",
      role: "asesor",
      status: "activa",
    },
    {
      id: otherAdvisorId,
      email: `ajena-${otherAdvisorId}@example.test`,
      displayName: "Ajena",
      role: "asesor",
      status: "activa",
    },
  ]);
  await crear(
    recordingId,
    advisorId,
    "[0s] [Speaker 0] Eso vale 189 mil.",
    "[00:05:00] @a: precio",
  );
  await crear(ajenaId, otherAdvisorId, "[0s] transcripcion de otra asesora", null);
});

afterAll(async () => {
  await connection.db.delete(liveRecordings).where(eq(liveRecordings.advisorId, advisorId));
  await connection.db.delete(liveRecordings).where(eq(liveRecordings.advisorId, otherAdvisorId));
  await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
  await connection.db.delete(advisors).where(eq(advisors.id, otherAdvisorId));
  await connection.close();
});

describe("getRecordingTranscript", () => {
  it("devuelve la transcripcion y el chat de una grabacion propia", async () => {
    const result = await getRecordingTranscript(recordingId, {
      authorize,
      database: connection.db,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.transcript).toContain("189 mil");
    expect(result.data.chatLog).toContain("precio");
  });

  it("no deja leer la transcripcion de otra asesora", async () => {
    // Una transcripcion trae PII de clientas: el id existe, pero para esta
    // asesora tiene que comportarse como si no.
    const result = await getRecordingTranscript(ajenaId, { authorize, database: connection.db });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("rechaza un identificador que no es un uuid", async () => {
    const result = await getRecordingTranscript("no-es-un-uuid", {
      authorize,
      database: connection.db,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION");
  });

  it("no responde sin sesion valida", async () => {
    const result = await getRecordingTranscript(recordingId, {
      authorize: async () => ({
        ok: false as const,
        error: { code: "UNAUTHORIZED", message: "Sin sesión." },
      }),
      database: connection.db,
    });

    expect(result.ok).toBe(false);
  });
});
