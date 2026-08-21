import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { logFailure } from "../../lib/log.ts";
import { db } from "../../db/client.ts";
import { liveRecordings } from "../../db/schema.ts";
import { createAdminSupabaseClient, type AdvisorRole, requireRole } from "../../lib/auth.ts";
import { env } from "../../lib/env.ts";
import { compressForTranscription } from "./compress.ts";
import { GROQ_MAX_AUDIO_SECONDS, transcribeWithGroq } from "./groq.ts";
import {
  applyTranscriptionParams,
  deepgramCallbackSchema,
  getTranscriptionConfig,
  type TranscriptionConfig,
  transcriptFromPayload,
} from "./transcription.ts";

/**
 * Transcribe mandando los bytes del audio y leyendo el texto en la MISMA
 * respuesta HTTP.
 *
 * El camino con callback exige dos cosas alcanzables desde internet: una URL de
 * la que Deepgram baje el archivo y una URL a la que devuelva el resultado. En
 * desarrollo no existe ninguna de las dos, asi que la grabacion se quedaba en
 * `transcribing` para siempre. Mandando los bytes desaparecen ambas.
 *
 * El costo es que la peticion queda abierta mientras Deepgram trabaja. Deepgram
 * corta a los 10 minutos de PROCESAMIENTO (no de duracion), y por eso ese es el
 * techo de aqui: esperar mas no sirve porque del otro lado ya se rindio.
 */
const SYNC_TIMEOUT_MS = 600_000;

export async function transcribeNow(
  input: { audio: ArrayBuffer; contentType: string },
  options: { config?: TranscriptionConfig; fetcher?: typeof fetch } = {},
) {
  const config = options.config ?? getTranscriptionConfig();
  const endpoint = new URL(config.baseUrl);
  applyTranscriptionParams(endpoint, config);

  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(endpoint.toString(), {
      method: "POST",
      headers: {
        Authorization: `Token ${config.apiKey}`,
        "Content-Type": input.contentType,
      },
      body: input.audio,
      signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
    });
  } catch (error) {
    logFailure("transcribeNow", error);
    return {
      ok: false as const,
      error: { code: "PROVIDER_UNAVAILABLE", message: "No se pudo transcribir la grabación." },
    };
  }

  if (!response.ok) {
    return {
      ok: false as const,
      error: {
        code: response.status === 504 ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE",
        message:
          response.status === 504
            ? "La grabación es demasiado larga para transcribirla de una sola vez."
            : "No se pudo transcribir la grabación.",
      },
    };
  }

  const parsed = deepgramCallbackSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    // Un audio sin voz reconocible entra por aqui: el esquema exige transcript
    // no vacio, y una grabacion muda no es una transcripcion valida.
    return {
      ok: false as const,
      error: { code: "PROVIDER_MALFORMED", message: "La grabación no produjo texto." },
    };
  }

  return {
    ok: true as const,
    data: {
      transcript: transcriptFromPayload(parsed.data),
      durationS: Math.round(parsed.data.metadata.duration),
    },
  };
}

export type TranscribeAudio = (input: {
  audio: ArrayBuffer;
  contentType: string;
}) => Promise<
  | { ok: true; data: { transcript: string; durationS: number } }
  | { ok: false; error: { code: string; message: string } }
>;

/**
 * Cada proveedor declara su propio tope de tamano, y ese tope decide si hay que
 * recomprimir. Deepgram admite 2 GB y por eso casi nunca comprime; el tier
 * gratuito de Groq admite 25 MB y por eso casi siempre lo hace.
 */
const DEEPGRAM = {
  nombre: "deepgram" as const,
  transcribe: (input: Parameters<TranscribeAudio>[0]) => transcribeNow(input),
  maxBytes: 2 * 1024 * 1024 * 1024,
};

/**
 * Elige proveedor por duracion, no solo por configuracion.
 *
 * El tier gratuito de Groq admite 7.200 segundos de audio por hora de reloj, y
 * un live de dos horas y media los pasa. Como el limite es por ventana y no por
 * peticion, trocear no lo esquiva: los segundos se gastan igual. Con Groq
 * configurado y una grabacion que no le cabe, se usa Deepgram —que no tiene ese
 * tope y ya esta pagado— en vez de fallar. Lo gratis cubre los lives cortos y el
 * credito se gasta solo en los que lo necesitan.
 *
 * Si la duracion no se pudo medir se intenta con Groq igual: fallara con un
 * mensaje claro, que es mejor que gastar credito por una sospecha.
 */
export function resolveProvider(durationS: number | null, sizeBytes: number | null = null) {
  if (env.TRANSCRIPTION_PROVIDER !== "groq") return DEEPGRAM;

  // Por TAMANO ademas de por duracion. Desde que la subida no comprime —ffmpeg
  // no existe en Vercel—, un archivo sobre el tope de Groq no se puede encoger:
  // el unico camino es Deepgram, que admite 2 GB sin comprimir. Y el tamano
  // siempre se conoce, mientras que la duracion viene nula hasta transcribir.
  const noCabePorTamano = sizeBytes !== null && sizeBytes > env.TRANSCRIPTION_MAX_BYTES;
  if (noCabePorTamano && env.DEEPGRAM_API_KEY) {
    logFailure(
      "transcribeRecording",
      `grabación de ${Math.round(sizeBytes / (1024 * 1024))} MB: excede el tope de Groq y no se puede comprimir, se usa Deepgram`,
    );
    return DEEPGRAM;
  }

  const noLeCabe = durationS !== null && durationS > GROQ_MAX_AUDIO_SECONDS;
  if (noLeCabe && env.DEEPGRAM_API_KEY) {
    logFailure(
      "transcribeRecording",
      `grabación de ${Math.round(durationS / 60)} min: excede los ${GROQ_MAX_AUDIO_SECONDS / 60} min de Groq, se usa Deepgram`,
    );
    return DEEPGRAM;
  }

  return {
    nombre: "groq" as const,
    transcribe: (input: Parameters<TranscribeAudio>[0]) => transcribeWithGroq(input),
    maxBytes: env.TRANSCRIPTION_MAX_BYTES,
  };
}

type TranscribeDatabase = Pick<typeof db, "select" | "update">;
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };
type TranscribeStorage = {
  download: (path: string) => Promise<{ data: Blob | null; error: { message: string } | null }>;
  /** Se llama al terminar bien: el audio ya no hace falta. */
  remove: (paths: string[]) => Promise<unknown>;
};

export type TranscribeRecordingDependencies = {
  authorize?: (role: AdvisorRole) => Promise<AuthorizationResult>;
  database?: TranscribeDatabase;
  storage?: TranscribeStorage;
  bucket?: string;
  transcribe?: TranscribeAudio;
  maxBytes?: number;
  config?: TranscriptionConfig;
};

function defaultStorage(bucket: string): TranscribeStorage {
  const storage = createAdminSupabaseClient().storage.from(bucket);
  return {
    download: (path) => storage.download(path),
    remove: (paths) => storage.remove(paths),
  };
}

/**
 * Transcribe una grabacion ya subida, en el momento y sin callback.
 *
 * Es un paso explicito y no parte de la subida a proposito: la subida ya mueve
 * hasta 200 MB por una sola peticion, y encadenarle los minutos que Deepgram
 * tarda en responder convertiria un fallo de red en la perdida del archivo
 * recien cargado. Separados, reintentar es gratis.
 *
 * La transicion a `transcribing` es condicional y sirve de cerrojo, igual que en
 * el analisis. Se admite reclamar desde `transcribing` porque ese es justamente
 * el estado en el que quedan varadas las grabaciones que esperan un callback que
 * nunca va a llegar: rescatarlas es para lo que existe esta ruta.
 */
export async function transcribeRecording(
  recordingId: string,
  options: TranscribeRecordingDependencies = {},
) {
  const authorization = await (options.authorize ?? requireRole)("asesor");
  if (!authorization.ok) return authorization;

  const parsedId = z.uuid().safeParse(recordingId);
  if (!parsedId.success) {
    return {
      ok: false as const,
      error: {
        code: "VALIDATION",
        message: "El identificador no es válido.",
        field: "recordingId",
      },
    };
  }

  const database = options.database ?? db;
  const [recording] = await database
    .select({
      id: liveRecordings.id,
      status: liveRecordings.status,
      storagePath: liveRecordings.storagePath,
      durationS: liveRecordings.durationS,
    })
    .from(liveRecordings)
    .where(
      and(
        eq(liveRecordings.id, parsedId.data),
        eq(liveRecordings.advisorId, authorization.data.id),
      ),
    )
    .limit(1);
  if (!recording) {
    return { ok: false as const, error: { code: "NOT_FOUND", message: "La grabación no existe." } };
  }
  if (recording.status === "transcribed" || recording.status === "analyzed") {
    return {
      ok: false as const,
      error: { code: "CONFLICT", message: "Esta grabación ya tiene transcripción." },
    };
  }
  if (recording.status === "analyzing") {
    return {
      ok: false as const,
      error: { code: "CONFLICT", message: "La grabación está en análisis." },
    };
  }
  if (recording.storagePath.startsWith("manual/")) {
    return {
      ok: false as const,
      error: { code: "CONFLICT", message: "Esta transcripción se pegó a mano; no hay audio." },
    };
  }

  const claimed = await database
    .update(liveRecordings)
    .set({ status: "transcribing" })
    .where(and(eq(liveRecordings.id, recording.id), eq(liveRecordings.status, recording.status)))
    .returning({ id: liveRecordings.id });
  if (claimed.length === 0) {
    return {
      ok: false as const,
      error: { code: "CONFLICT", message: "Otra transcripción ya está en curso." },
    };
  }

  const fail = async (code: string, message: string) => {
    await database
      .update(liveRecordings)
      .set({ status: "failed" })
      .where(and(eq(liveRecordings.id, recording.id), eq(liveRecordings.status, "transcribing")));
    return { ok: false as const, error: { code, message } };
  };

  const bucket = options.bucket ?? env.SUPABASE_RECORDINGS_BUCKET;
  if (!bucket) return await fail("INTERNAL", "Storage no está configurado.");

  const storage = options.storage ?? defaultStorage(bucket);
  const downloaded = await storage.download(recording.storagePath).catch(() => null);
  if (!downloaded?.data || downloaded.error) {
    return await fail("INTERNAL", "No se pudo leer el audio guardado.");
  }

  const audio = await downloaded.data.arrayBuffer();
  const provider = resolveProvider(recording.durationS, audio.byteLength);
  const compressed = await compressForTranscription(
    { audio, contentType: downloaded.data.type || "application/octet-stream" },
    { maxBytes: options.maxBytes ?? provider.maxBytes },
  );
  if (!compressed.ok) return await fail(compressed.error.code, compressed.error.message);

  const transcribed = await (options.transcribe ?? provider.transcribe)({
    audio: compressed.data.audio,
    contentType: compressed.data.contentType,
  });
  if (!transcribed.ok) return await fail(transcribed.error.code, transcribed.error.message);

  const [updated] = await database
    .update(liveRecordings)
    .set({
      status: "transcribed",
      transcript: transcribed.data.transcript,
      durationS: transcribed.data.durationS,
    })
    .where(and(eq(liveRecordings.id, recording.id), eq(liveRecordings.status, "transcribing")))
    .returning();
  if (!updated) return await fail("CONFLICT", "La grabación cambió de estado.");

  // El audio ya no hace falta: el activo es la transcripcion, y el original
  // sigue en el computador de la asesora, que lo descargo del live. Borrarlo
  // deja el bucket en unos pocos MB en vez de acumular 90 dias de audio, y
  // saca de encima la copia que arrastra PII de clientas.
  //
  // Si el borrado falla no se toca el resultado: la transcripcion ya esta
  // guardada, y la retencion volvera a intentarlo cuando expire la fila.
  const removed = await storage.remove([recording.storagePath]).catch(() => null);
  if (removed === null) {
    logFailure("transcribeRecording/remove", `quedo el audio de ${recording.id} en Storage`);
  }

  return { ok: true as const, data: updated };
}
