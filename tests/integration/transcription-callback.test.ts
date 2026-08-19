import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import { advisors, liveRecordings } from "../../src/db/schema.ts";
import { handleTranscriptionCallback } from "../../src/server/recordings/transcription.ts";

const connection = openDirectDatabase("test");
const advisorId = randomUUID();
const callbackSecret = "integration-callback-secret";
const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/deepgram-callback.json", import.meta.url), "utf8"),
) as unknown;

async function createRecording(token: string) {
  const [recording] = await connection.db
    .insert(liveRecordings)
    .values({
      advisorId,
      storagePath: `${advisorId}/${randomUUID()}.mp3`,
      status: "transcribing",
      callbackToken: token,
      expiresAt: new Date("2026-12-01T00:00:00.000Z"),
    })
    .returning();
  if (!recording) throw new Error("No se creó el fixture de grabación.");
  return recording;
}

beforeAll(async () => {
  await connection.db.insert(advisors).values({
    id: advisorId,
    email: `${advisorId}@transcription-callback.test`,
    displayName: "Callback Owner",
  });
});

afterAll(async () => {
  await connection.db.delete(liveRecordings).where(eq(liveRecordings.advisorId, advisorId));
  await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
  await connection.close();
});

describe("transcription callback", () => {
  it("returns 401 before reading the body or writing with an invalid secret", async () => {
    const recording = await createRecording(`invalid-secret-${randomUUID()}`);
    const readBody = vi.fn(async () => fixture);

    const result = await handleTranscriptionCallback(
      { secret: "wrong", token: recording.callbackToken, readBody },
      { callbackSecret, database: connection.db },
    );

    expect(result.status).toBe(401);
    expect(readBody).not.toHaveBeenCalled();
    const [persisted] = await connection.db
      .select()
      .from(liveRecordings)
      .where(eq(liveRecordings.id, recording.id));
    expect(persisted?.status).toBe("transcribing");
  });

  it("returns 404 for an unknown token without reading the body", async () => {
    const readBody = vi.fn(async () => fixture);
    const result = await handleTranscriptionCallback(
      { secret: callbackSecret, token: `unknown-${randomUUID()}`, readBody },
      { callbackSecret, database: connection.db },
    );
    expect(result.status).toBe(404);
    expect(readBody).not.toHaveBeenCalled();
  });

  it("returns 422 and marks a malformed callback as failed", async () => {
    const recording = await createRecording(`malformed-${randomUUID()}`);
    const result = await handleTranscriptionCallback(
      {
        secret: callbackSecret,
        token: recording.callbackToken,
        readBody: async () => ({ bad: true }),
      },
      { callbackSecret, database: connection.db },
    );
    expect(result.status).toBe(422);
    const [persisted] = await connection.db
      .select()
      .from(liveRecordings)
      .where(eq(liveRecordings.id, recording.id));
    expect(persisted?.status).toBe("failed");
  });

  it("transitions to transcribed once and returns 200 for a duplicate callback", async () => {
    const recording = await createRecording(`valid-${randomUUID()}`);
    const callback = () =>
      handleTranscriptionCallback(
        { secret: callbackSecret, token: recording.callbackToken, readBody: async () => fixture },
        { callbackSecret, database: connection.db },
      );

    const first = await callback();
    const second = await callback();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const rows = await connection.db
      .select()
      .from(liveRecordings)
      .where(eq(liveRecordings.callbackToken, recording.callbackToken));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "transcribed",
      durationS: 42,
      transcript:
        "[0s] [Speaker 0] Hola, hoy vamos a revisar el producto.\n[5s] [Speaker 1] ¿Cómo se usa?",
    });
  });
});
