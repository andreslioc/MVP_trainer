import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
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
        file: {
          name: "live.mp3",
          type: "audio/mpeg",
          size: fileBytes.byteLength,
          arrayBuffer: async () => fileBytes,
        },
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
});
