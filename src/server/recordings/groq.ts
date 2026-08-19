import { z } from "zod";

import { env } from "../../lib/env.ts";

/**
 * Transcripcion con Groq (Whisper large-v3-turbo), API compatible con OpenAI.
 *
 * Devuelve exactamente la misma forma que `transcribeNow` de Deepgram para que
 * el consumidor no sepa con quien habla. La diferencia real es que Groq NO hace
 * diarizacion: no hay `[Speaker N]`. Este producto no la usa —nada en el codigo
 * parsea esas etiquetas y en un live la unica voz es la de la asesora—, asi que
 * el formato conserva la marca de tiempo, que si se consume.
 *
 * Tier gratuito: 8 horas de audio al dia, 20 peticiones por minuto, 25 MB por
 * archivo. El tope de tamano es la razon por la que existe `compress.ts`.
 */

const REQUEST_TIMEOUT_MS = 600_000;

const groqResponseSchema = z.object({
  text: z.string(),
  duration: z.number().finite().nonnegative().optional(),
  segments: z
    .array(
      z.object({
        start: z.number().finite().nonnegative(),
        text: z.string(),
      }),
    )
    .optional(),
});

export type GroqConfig = { apiKey: string; baseUrl: string; model: string; language: string };

export function getGroqConfig(): GroqConfig {
  return z
    .object({
      apiKey: z.string().min(1),
      baseUrl: z.url(),
      model: z.string().min(1),
      language: z.string().min(1),
    })
    .parse({
      apiKey: env.GROQ_API_KEY,
      baseUrl: env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
      model: env.GROQ_MODEL ?? "whisper-large-v3-turbo",
      // Whisper espera el codigo corto; es-419 lo rechaza.
      language: (env.DEEPGRAM_LANGUAGE ?? "es").slice(0, 2),
    });
}

/** Mismo formato que la ruta de Deepgram, menos el hablante que Groq no da. */
function transcriptFromSegments(payload: z.infer<typeof groqResponseSchema>) {
  if (!payload.segments?.length) return payload.text.trim();
  return payload.segments
    .map((segment) => `[${Math.round(segment.start)}s] ${segment.text.trim()}`)
    .filter((line) => line.length > 0)
    .join("\n");
}

export async function transcribeWithGroq(
  input: { audio: ArrayBuffer; contentType: string },
  options: { config?: GroqConfig; fetcher?: typeof fetch } = {},
) {
  const config = options.config ?? getGroqConfig();

  const form = new FormData();
  form.set("file", new Blob([input.audio], { type: input.contentType }), "audio.ogg");
  form.set("model", config.model);
  form.set("language", config.language);
  form.set("response_format", "verbose_json");
  // Sin esto la respuesta trae el texto corrido y se pierde el segundo de cada
  // linea, que es justo lo que permite ubicar un momento del live.
  form.set("timestamp_granularities[]", "segment");

  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(`${config.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return {
      ok: false as const,
      error: { code: "PROVIDER_UNAVAILABLE", message: "No se pudo transcribir la grabación." },
    };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // 429 en el tier gratuito es la cuota diaria de audio, no saturacion: no se
    // arregla reintentando en un minuto y decir "intenta de nuevo" seria mentir.
    if (response.status === 429) {
      return {
        ok: false as const,
        error: {
          code: "QUOTA_EXCEEDED",
          message: "Se agotó la cuota gratuita de transcripción de hoy. Intenta mañana.",
        },
      };
    }
    return {
      ok: false as const,
      error: {
        code: response.status === 413 ? "TOO_LARGE" : "PROVIDER_UNAVAILABLE",
        message:
          response.status === 413
            ? "El audio pesa más de lo que admite el proveedor."
            : `No se pudo transcribir la grabación. ${detail.slice(0, 160)}`,
      },
    };
  }

  const parsed = groqResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    return {
      ok: false as const,
      error: {
        code: "PROVIDER_MALFORMED",
        message: "El proveedor devolvió una respuesta ilegible.",
      },
    };
  }

  const transcript = transcriptFromSegments(parsed.data);
  if (!transcript) {
    return {
      ok: false as const,
      error: { code: "PROVIDER_MALFORMED", message: "La grabación no produjo texto." },
    };
  }

  return {
    ok: true as const,
    data: { transcript, durationS: Math.round(parsed.data.duration ?? 0) },
  };
}
