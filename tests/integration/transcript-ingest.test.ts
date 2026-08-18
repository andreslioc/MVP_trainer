import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import { advisors, liveRecordings } from "../../src/db/schema.ts";
import { ingestTranscript } from "../../src/server/recordings/ingest.ts";

const connection = openDirectDatabase("test");
const advisorId = randomUUID();
const otherId = randomUUID();
const authorize = async () => ({
  ok: true as const,
  data: { id: advisorId, role: "asesor" as const },
});

beforeAll(async () => {
  await connection.db.insert(advisors).values([
    {
      id: advisorId,
      email: `ingest-${advisorId}@example.test`,
      displayName: "Ingest",
      role: "asesor",
      status: "activa",
    },
    {
      id: otherId,
      email: `ingest-otra-${otherId}@example.test`,
      displayName: "Otra",
      role: "asesor",
      status: "activa",
    },
  ]);
});

afterAll(async () => {
  for (const id of [advisorId, otherId]) {
    await connection.db.delete(liveRecordings).where(eq(liveRecordings.advisorId, id));
    await connection.db.delete(advisors).where(eq(advisors.id, id));
  }
  await connection.close();
});

describe("ingestTranscript", () => {
  const transcript =
    "[Speaker 0] Hola a todas, hoy tenemos la creatina monohidratada y varias preguntas sobre su uso diario.";

  it("crea una grabacion lista para analizar, sin pasar por Storage", async () => {
    const result = await ingestTranscript(
      { transcript },
      { authorize, database: connection.db, retentionDays: 90 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("transcribed");
    expect(result.data.transcript).toBe(transcript);
    expect(result.data.advisorId).toBe(advisorId);
    // La ruta declara que no hay objeto en Storage en vez de fingir uno.
    expect(result.data.storagePath.startsWith("manual/")).toBe(true);
  });

  it("aplica la misma retencion que una grabacion subida", async () => {
    const now = new Date("2026-08-18T12:00:00Z");
    const result = await ingestTranscript(
      { transcript },
      { authorize, database: connection.db, now: () => now, retentionDays: 90 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const days = Math.round((result.data.expiresAt.getTime() - now.getTime()) / 86_400_000);
    expect(days).toBe(90);
  });

  it("rechaza una transcripcion demasiado corta para analizar", async () => {
    const result = await ingestTranscript(
      { transcript: "hola" },
      { authorize, database: connection.db },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION");
  });

  it("propaga el rechazo de autorizacion sin escribir nada", async () => {
    const before = await connection.db
      .select({ id: liveRecordings.id })
      .from(liveRecordings)
      .where(eq(liveRecordings.advisorId, otherId));

    const result = await ingestTranscript(
      { transcript },
      {
        authorize: async () => ({
          ok: false as const,
          error: { code: "UNAUTHENTICATED", message: "sin sesion" },
        }),
        database: connection.db,
      },
    );

    expect(result.ok).toBe(false);
    const after = await connection.db
      .select({ id: liveRecordings.id })
      .from(liveRecordings)
      .where(eq(liveRecordings.advisorId, otherId));
    expect(after).toHaveLength(before.length);
  });
});
