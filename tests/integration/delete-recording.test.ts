import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import { advisors, chatCoverage, insights, liveRecordings } from "../../src/db/schema.ts";
import { deleteRecording } from "../../src/server/recordings/delete.ts";

const connection = openDirectDatabase("test");
const advisorId = randomUUID();
const otherAdvisorId = randomUUID();

const authorize = async () => ({
  ok: true as const,
  data: { id: advisorId, role: "asesor" as const },
});

const storage = { remove: async () => ({}) };

async function crear(owner = advisorId) {
  const id = randomUUID();
  await connection.db.insert(liveRecordings).values({
    id,
    advisorId: owner,
    storagePath: `${owner}/${id}.ogg`,
    status: "analyzed",
    transcript: "[0s] hola",
    durationS: 60,
    callbackToken: randomUUID(),
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  await connection.db.insert(insights).values({
    recordingId: id,
    type: "faq",
    text: "preguntan el precio",
    frequency: 3,
  });
  await connection.db.insert(chatCoverage).values({
    recordingId: id,
    question: "a como",
    answered: false,
  });
  return id;
}

beforeAll(async () => {
  await connection.db.insert(advisors).values([
    {
      id: advisorId,
      email: `borrar-${advisorId}@example.test`,
      displayName: "Borra",
      role: "asesor",
      status: "activa",
    },
    {
      id: otherAdvisorId,
      email: `otra-${otherAdvisorId}@example.test`,
      displayName: "Otra",
      role: "asesor",
      status: "activa",
    },
  ]);
});

afterAll(async () => {
  for (const id of [advisorId, otherAdvisorId]) {
    await connection.db.delete(liveRecordings).where(eq(liveRecordings.advisorId, id));
    await connection.db.delete(advisors).where(eq(advisors.id, id));
  }
  await connection.close();
});

describe("deleteRecording", () => {
  it("se lleva los hallazgos y las preguntas del chat", async () => {
    const id = await crear();
    const result = await deleteRecording(id, {
      authorize,
      database: connection.db,
      storage,
      bucket: "live-recordings",
    });

    expect(result.ok).toBe(true);
    expect(
      await connection.db.select().from(liveRecordings).where(eq(liveRecordings.id, id)),
    ).toHaveLength(0);
    expect(
      await connection.db.select().from(insights).where(eq(insights.recordingId, id)),
    ).toHaveLength(0);
    expect(
      await connection.db.select().from(chatCoverage).where(eq(chatCoverage.recordingId, id)),
    ).toHaveLength(0);
  });

  it("borra el archivo de Storage, no solo la fila", async () => {
    // Una base no sabe de archivos: sin esto queda el audio con PII de
    // clientas, sin nada que lo referencie ni lo expire.
    const borrados: string[][] = [];
    const id = await crear();
    await deleteRecording(id, {
      authorize,
      database: connection.db,
      storage: {
        remove: async (paths: string[]) => {
          borrados.push(paths);
          return {};
        },
      },
      bucket: "live-recordings",
    });

    expect(borrados).toContainEqual([`${advisorId}/${id}.ogg`]);
  });

  it("no deja borrar la grabación de otra asesora", async () => {
    const ajena = await crear(otherAdvisorId);
    const result = await deleteRecording(ajena, {
      authorize,
      database: connection.db,
      storage,
      bucket: "live-recordings",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
    expect(
      await connection.db.select().from(liveRecordings).where(eq(liveRecordings.id, ajena)),
    ).toHaveLength(1);
  });

  it("rechaza un identificador que no es un uuid", async () => {
    const result = await deleteRecording("no-es-uuid", {
      authorize,
      database: connection.db,
      storage,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION");
  });
});
