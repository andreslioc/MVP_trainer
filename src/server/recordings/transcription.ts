import { createHash, timingSafeEqual } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../db/client.ts";
import { liveRecordings } from "../../db/schema.ts";
import { env } from "../../lib/env.ts";

const deepgramAcceptedSchema = z.object({ request_id: z.string().trim().min(1) }).passthrough();

export const deepgramCallbackSchema = z
  .object({
    metadata: z.object({ duration: z.number().finite().nonnegative() }).passthrough(),
    results: z
      .object({
        channels: z
          .array(
            z
              .object({
                alternatives: z
                  .array(z.object({ transcript: z.string().trim().min(1) }).passthrough())
                  .min(1),
              })
              .passthrough(),
          )
          .min(1),
        utterances: z
          .array(
            z
              .object({
                speaker: z.number().int().nonnegative(),
                transcript: z.string().trim().min(1),
                start_time: z.number().finite().nonnegative().optional(),
                end_time: z.number().finite().nonnegative().optional(),
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

export type DeepgramConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  language: string;
  callbackSecret: string;
  publicBaseUrl: string;
};

type CallbackDatabase = Pick<typeof db, "select" | "update">;

export type CallbackInput = {
  secret: string | null;
  token: string | null;
  readBody: () => Promise<unknown>;
};

export function getDeepgramConfig(): DeepgramConfig {
  return z
    .object({
      apiKey: z.string().min(1),
      baseUrl: z.url(),
      model: z.string().min(1),
      language: z.string().min(1),
      callbackSecret: z.string().min(16),
      publicBaseUrl: z.url(),
    })
    .parse({
      apiKey: env.DEEPGRAM_API_KEY,
      baseUrl: env.DEEPGRAM_BASE_URL,
      model: env.DEEPGRAM_MODEL,
      language: env.DEEPGRAM_LANGUAGE,
      callbackSecret: env.DEEPGRAM_CALLBACK_SECRET,
      publicBaseUrl: env.PUBLIC_BASE_URL,
    });
}

export function secretsMatch(received: string | null, expected: string) {
  const receivedDigest = createHash("sha256")
    .update(received ?? "")
    .digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(receivedDigest, expectedDigest);
}

export function callbackSecretFromRequest(request: Request) {
  const explicit = request.headers.get("x-callback-secret");
  if (explicit) return explicit;
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) return null;
  try {
    const credentials = Buffer.from(authorization.slice(6), "base64").toString("utf8");
    const separator = credentials.indexOf(":");
    return separator >= 0 ? credentials.slice(separator + 1) : null;
  } catch {
    return null;
  }
}

export function buildDeepgramRequest(
  input: { audioUrl: string; callbackToken: string },
  config: DeepgramConfig,
) {
  const endpoint = new URL(config.baseUrl);
  const callback = new URL("/api/transcription-callback", config.publicBaseUrl);
  callback.username = "deepgram";
  callback.password = config.callbackSecret;
  callback.searchParams.set("token", input.callbackToken);
  endpoint.searchParams.set("model", config.model);
  endpoint.searchParams.set("language", config.language);
  endpoint.searchParams.set("diarize_model", "latest");
  endpoint.searchParams.set("punctuate", "true");
  endpoint.searchParams.set("smart_format", "true");
  endpoint.searchParams.set("utterances", "true");
  endpoint.searchParams.set("callback_method", "POST");
  endpoint.searchParams.set("callback", callback.toString());

  return {
    url: endpoint.toString(),
    init: {
      method: "POST",
      headers: {
        Authorization: `Token ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: input.audioUrl }),
    } satisfies RequestInit,
  };
}

export async function enqueueTranscription(
  input: { audioUrl: string; callbackToken: string },
  options: { config?: DeepgramConfig; fetcher?: typeof fetch } = {},
) {
  try {
    const request = buildDeepgramRequest(input, options.config ?? getDeepgramConfig());
    const response = await (options.fetcher ?? fetch)(request.url, request.init);
    if (!response.ok) {
      return {
        ok: false as const,
        error: { code: "PROVIDER_UNAVAILABLE", message: "No se pudo iniciar la transcripción." },
      };
    }
    const accepted = deepgramAcceptedSchema.safeParse(await response.json());
    if (!accepted.success) {
      return {
        ok: false as const,
        error: { code: "PROVIDER_MALFORMED", message: "Deepgram no confirmó la solicitud." },
      };
    }
    return { ok: true as const, data: { requestId: accepted.data.request_id } };
  } catch {
    return {
      ok: false as const,
      error: { code: "PROVIDER_UNAVAILABLE", message: "No se pudo iniciar la transcripción." },
    };
  }
}

function transcriptFromPayload(payload: z.infer<typeof deepgramCallbackSchema>) {
  if (payload.results.utterances?.length) {
    return payload.results.utterances
      .map((utterance) => {
        const timestamp =
          utterance.start_time !== undefined ? `[${Math.round(utterance.start_time)}s]` : "";
        return `${timestamp} [Speaker ${utterance.speaker}] ${utterance.transcript}`;
      })
      .join("\n");
  }
  return payload.results.channels[0]?.alternatives[0]?.transcript ?? "";
}

export async function handleTranscriptionCallback(
  input: CallbackInput,
  options: { callbackSecret?: string; database?: CallbackDatabase } = {},
) {
  const callbackSecret = options.callbackSecret ?? env.DEEPGRAM_CALLBACK_SECRET ?? "";
  if (!callbackSecret || !secretsMatch(input.secret, callbackSecret)) {
    return {
      status: 401,
      body: { ok: false, error: { code: "UNAUTHENTICATED", message: "Secreto inválido." } },
    };
  }
  if (!input.token) {
    return {
      status: 404,
      body: { ok: false, error: { code: "NOT_FOUND", message: "Grabación no encontrada." } },
    };
  }

  const database = options.database ?? db;
  const [recording] = await database
    .select({ id: liveRecordings.id })
    .from(liveRecordings)
    .where(eq(liveRecordings.callbackToken, input.token))
    .limit(1);
  if (!recording) {
    return {
      status: 404,
      body: { ok: false, error: { code: "NOT_FOUND", message: "Grabación no encontrada." } },
    };
  }

  let rawBody: unknown;
  try {
    rawBody = await input.readBody();
  } catch {
    rawBody = null;
  }
  const parsed = deepgramCallbackSchema.safeParse(rawBody);
  if (!parsed.success) {
    await database
      .update(liveRecordings)
      .set({ status: "failed" })
      .where(
        and(
          eq(liveRecordings.callbackToken, input.token),
          eq(liveRecordings.status, "transcribing"),
        ),
      );
    return {
      status: 422,
      body: { ok: false, error: { code: "VALIDATION", message: "Callback inválido." } },
    };
  }

  await database
    .update(liveRecordings)
    .set({
      status: "transcribed",
      transcript: transcriptFromPayload(parsed.data),
      durationS: Math.round(parsed.data.metadata.duration),
    })
    .where(
      and(eq(liveRecordings.callbackToken, input.token), eq(liveRecordings.status, "transcribing")),
    );
  return { status: 200, body: { ok: true } };
}
