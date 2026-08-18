import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import { advisors, insights, liveRecordings } from "../../src/db/schema.ts";
import { cronSecretMatches, RETENTION_LOCK_KEY, runRetention } from "../../src/server/retention.ts";

const connection = openDirectDatabase("test");
const advisorId = randomUUID();

function memoryStorage() {
  const removed: string[] = [];
  return {
    removed,
    storage: {
      remove: async (paths: string[]) => {
        removed.push(...paths);
        return { error: null };
      },
    },
  };
}

async function seedRecording(expiresAt: Date) {
  const id = randomUUID();
  await connection.db.insert(liveRecordings).values({
    id,
    advisorId,
    storagePath: `live-recordings/${id}.mp4`,
    status: "analyzed",
    transcript: "[Speaker 0] contenido vencido",
    callbackToken: randomUUID(),
    expiresAt,
  });
  await connection.db.insert(insights).values({
    recordingId: id,
    type: "faq",
    text: `hallazgo de ${id.slice(0, 8)}`,
    productId: null,
    frequency: 1,
  });
  return id;
}

beforeAll(async () => {
  await connection.db.insert(advisors).values({
    id: advisorId,
    email: `retention-${advisorId}@example.test`,
    displayName: "Retention",
    role: "asesor",
    status: "activa",
  });
});

afterAll(async () => {
  await connection.db.delete(liveRecordings).where(eq(liveRecordings.advisorId, advisorId));
  await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
  await connection.close();
});

describe("cronSecretMatches", () => {
  it("rechaza un bearer ausente, vacio o incorrecto", () => {
    expect(cronSecretMatches(null)).toBe(false);
    expect(cronSecretMatches("Bearer ")).toBe(false);
    expect(cronSecretMatches("Bearer no-es-el-secreto")).toBe(false);
    expect(cronSecretMatches("no-empieza-con-bearer")).toBe(false);
  });
});

describe("runRetention", () => {
  it("borra objeto, fila e insights de una grabacion vencida, y la segunda corrida no encuentra nada", async () => {
    const expiredId = await seedRecording(new Date(Date.now() - 3_600_000));
    const { removed, storage } = memoryStorage();

    const first = await runRetention({ database: connection.db, storage });
    expect(first.skipped).toBe(false);
    if (first.skipped) return;
    expect(first.deleted).toBeGreaterThanOrEqual(1);
    expect(removed).toContain(`live-recordings/${expiredId}.mp4`);

    const rows = await connection.db
      .select({ id: liveRecordings.id })
      .from(liveRecordings)
      .where(eq(liveRecordings.id, expiredId));
    expect(rows).toHaveLength(0);

    // on delete cascade: los insights se van con la grabacion.
    const orphans = await connection.db
      .select({ id: insights.id })
      .from(insights)
      .where(eq(insights.recordingId, expiredId));
    expect(orphans).toHaveLength(0);

    const second = await runRetention({
      database: connection.db,
      storage: memoryStorage().storage,
    });
    expect(second.skipped).toBe(false);
    if (second.skipped) return;
    expect(second.deleted).toBe(0);
  });

  it("no toca una grabacion que todavia no vence", async () => {
    const futureId = await seedRecording(new Date(Date.now() + 30 * 24 * 3_600_000));
    const { removed, storage } = memoryStorage();

    await runRetention({ database: connection.db, storage });

    expect(removed).not.toContain(`live-recordings/${futureId}.mp4`);
    const rows = await connection.db
      .select({ id: liveRecordings.id })
      .from(liveRecordings)
      .where(eq(liveRecordings.id, futureId));
    expect(rows).toHaveLength(1);
  });

  it("conserva la fila cuando el borrado en Storage falla, para reintentar despues", async () => {
    const expiredId = await seedRecording(new Date(Date.now() - 3_600_000));
    const failing = {
      remove: async () => ({ error: { message: "storage caido" } }),
    };

    const result = await runRetention({ database: connection.db, storage: failing });
    expect(result.skipped).toBe(false);
    if (result.skipped) return;
    expect(result.storageFailures).toBeGreaterThanOrEqual(1);

    const rows = await connection.db
      .select({ id: liveRecordings.id })
      .from(liveRecordings)
      .where(eq(liveRecordings.id, expiredId));
    expect(rows).toHaveLength(1);

    await connection.db.delete(liveRecordings).where(inArray(liveRecordings.id, [expiredId]));
  });

  it("dos ejecuciones solapadas: la que no obtiene el cerrojo devuelve skipped", async () => {
    await seedRecording(new Date(Date.now() - 3_600_000));
    const holder = openDirectDatabase("test");
    try {
      // Sostenemos el advisory lock desde otra conexion durante toda la
      // transaccion. Sin esto la prueba no reproduce nada: dos corridas
      // seguidas son tan rapidas que se serializan solas y ambas ganan.
      await holder.db.transaction(async (tx) => {
        const held = await tx.execute<{ locked: boolean }>(
          sql`select pg_try_advisory_xact_lock(${RETENTION_LOCK_KEY}) as locked`,
        );
        expect(held[0]?.locked).toBe(true);

        const blocked = await runRetention({
          database: connection.db,
          storage: memoryStorage().storage,
        });
        expect(blocked.skipped).toBe(true);
        expect(blocked.deleted).toBe(0);
      });
    } finally {
      await holder.close();
    }
  });
});
