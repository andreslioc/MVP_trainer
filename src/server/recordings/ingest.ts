import { randomBytes, randomUUID } from "node:crypto";

import { z } from "zod";

import { db } from "../../db/client.ts";
import { liveRecordings } from "../../db/schema.ts";
import { type AdvisorRole, requireRole } from "../../lib/auth.ts";
import { env } from "../../lib/env.ts";

/**
 * Ingesta de una transcripcion ya escrita, sin pasar por Storage ni por el
 * proveedor de STT.
 *
 * Existe por una razon operativa concreta: el callback de transcripcion exige
 * que el proveedor alcance esta aplicacion desde internet, y en desarrollo
 * `localhost` no existe para nadie mas. Sin esta puerta, todo Live Intelligence
 * —analisis, insights y promocion a preguntas— es inalcanzable hasta que haya
 * un tunel o un despliegue. Tambien sirve en produccion cuando alguien ya tiene
 * la transcripcion por otro medio.
 *
 * No es un atajo que se salte reglas: la fila queda igual que una transcrita por
 * el proveedor, con la misma retencion y el mismo aislamiento por asesora.
 */
const ingestSchema = z
  .object({
    transcript: z.string().trim().min(40).max(500_000),
    durationS: z.number().int().positive().max(86_400).optional(),
  })
  .strict();

type IngestDatabase = Pick<typeof db, "insert">;
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };

export type IngestDependencies = {
  authorize?: (role: AdvisorRole) => Promise<AuthorizationResult>;
  database?: IngestDatabase;
  now?: () => Date;
  retentionDays?: number;
};

export async function ingestTranscript(input: unknown, options: IngestDependencies = {}) {
  const authorization = await (options.authorize ?? requireRole)("asesor");
  if (!authorization.ok) return authorization;

  const parsed = ingestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: {
        code: "VALIDATION",
        message: "Pega una transcripción de al menos 40 caracteres.",
        field: "transcript",
      },
    };
  }

  const createdAt = (options.now ?? (() => new Date()))();
  const expiresAt = new Date(
    createdAt.getTime() + (options.retentionDays ?? env.RECORDING_RETENTION_DAYS) * 86_400_000,
  );

  try {
    const [recording] = await (options.database ?? db)
      .insert(liveRecordings)
      .values({
        advisorId: authorization.data.id,
        // No hay objeto en Storage: la ruta lo dice en vez de fingir una.
        storagePath: `manual/${randomUUID()}.txt`,
        status: "transcribed",
        transcript: parsed.data.transcript,
        durationS: parsed.data.durationS ?? null,
        callbackToken: randomBytes(32).toString("hex"),
        expiresAt,
      })
      .returning();
    if (!recording) throw new Error("No se creo la grabacion.");
    return { ok: true as const, data: recording };
  } catch {
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudo guardar la transcripción." },
    };
  }
}
