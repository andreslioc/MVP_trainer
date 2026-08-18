import { eq, inArray, lt, sql } from "drizzle-orm";

import { db } from "../db/client.ts";
import { liveRecordings } from "../db/schema.ts";
import { createAdminSupabaseClient } from "../lib/auth.ts";
import { env } from "../lib/env.ts";

/**
 * Clave del advisory lock. Es un entero fijo y arbitrario: lo unico que importa
 * es que ninguna otra tarea del proyecto use el mismo numero.
 */
export const RETENTION_LOCK_KEY = 528_431;

/** Cuantas grabaciones procesa una sola ejecucion. Acota el trabajo por corrida. */
const BATCH_SIZE = 100;

type RetentionStorage = {
  remove: (paths: string[]) => Promise<{ error: { message: string } | null }>;
};

export type RetentionDependencies = {
  database?: Pick<typeof db, "transaction">;
  storage?: RetentionStorage;
  bucket?: string;
  now?: () => Date;
};

function defaultStorage(bucket: string): RetentionStorage {
  const storage = createAdminSupabaseClient().storage.from(bucket);
  return { remove: (paths) => storage.remove(paths) };
}

export type RetentionResult =
  | { skipped: true; deleted: 0 }
  | { skipped: false; deleted: number; storageFailures: number };

/**
 * Borra las grabaciones vencidas: el objeto en Storage y la fila, que arrastra
 * transcripcion e insights por `on delete cascade`.
 *
 * Tres propiedades que el cron necesita y que estan en el codigo, no en la
 * documentacion:
 *
 * 1. **Reconciliacion, no incremento.** Selecciona por `expires_at < ahora`, asi
 *    que correrlo dos veces no borra de mas: la segunda vez no encuentra nada.
 *    Vercel Cron entrega best-effort y puede duplicar una ejecucion.
 * 2. **Advisory lock transaccional.** `pg_try_advisory_xact_lock` se libera solo
 *    al cerrar la transaccion, incluso si el proceso muere. Dos ejecuciones
 *    solapadas no compiten: la segunda devuelve `skipped: true`.
 * 3. **Storage primero, fila despues.** Si el borrado del objeto falla, la fila
 *    sobrevive y la proxima corrida lo reintenta. Al reves quedaria un objeto
 *    huerfano sin nada que lo recuerde.
 */
export async function runRetention(options: RetentionDependencies = {}): Promise<RetentionResult> {
  const database = options.database ?? db;
  const bucket = options.bucket ?? env.SUPABASE_RECORDINGS_BUCKET ?? "live-recordings";
  const now = options.now ?? (() => new Date());

  return await database.transaction(async (tx) => {
    const locked = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(${RETENTION_LOCK_KEY}) as locked`,
    );
    if (!locked[0]?.locked) return { skipped: true as const, deleted: 0 as const };

    const expired = await tx
      .select({ id: liveRecordings.id, storagePath: liveRecordings.storagePath })
      .from(liveRecordings)
      .where(lt(liveRecordings.expiresAt, now()))
      .limit(BATCH_SIZE);
    if (expired.length === 0) {
      return { skipped: false as const, deleted: 0, storageFailures: 0 };
    }

    const storage = options.storage ?? defaultStorage(bucket);
    const removable: string[] = [];
    let storageFailures = 0;
    for (const recording of expired) {
      const { error } = await storage.remove([recording.storagePath]);
      if (error) {
        storageFailures += 1;
        continue;
      }
      removable.push(recording.id);
    }

    if (removable.length > 0) {
      await tx.delete(liveRecordings).where(inArray(liveRecordings.id, removable));
    }
    return { skipped: false as const, deleted: removable.length, storageFailures };
  });
}

/**
 * Compara el bearer del cron en tiempo constante contra `CRON_SECRET`.
 * Sin secreto configurado nadie pasa: un endpoint destructivo abierto es peor
 * que un endpoint roto.
 */
export function cronSecretMatches(header: string | null) {
  const expected = env.CRON_SECRET;
  if (!expected) return false;
  const received = header?.startsWith("Bearer ") ? header.slice(7) : "";
  if (received.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= received.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export async function markExpired(recordingId: string, at: Date) {
  await db.update(liveRecordings).set({ expiresAt: at }).where(eq(liveRecordings.id, recordingId));
}
