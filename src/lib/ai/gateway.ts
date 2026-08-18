import type { ZodType } from "zod";
import { z } from "zod";

import { env } from "../env.ts";
import {
  AI_MODELS,
  AI_PROVIDER,
  MODEL_PRICING_USD_PER_MTOK,
  type ModelPricing,
  THINKING_BUDGET_BY_EFFORT,
} from "./config.ts";

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type AiEffort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Peticion y respuesta NEUTRALES de proveedor.
 *
 * La version anterior de este archivo tipaba la costura con los tipos del SDK de
 * Anthropic, y eso no era una costura: era el proveedor filtrandose por toda la
 * capa. Cambiar de proveedor lo demostro. Ahora el adaptador traduce en los
 * bordes y el resto del gateway —ledger, errores, costos— no sabe con quien habla.
 */
export type AiProviderRequest = {
  model: string;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
  effort: AiEffort;
  jsonSchema?: unknown;
};

export type AiProviderResponse = {
  id: string;
  model: string;
  text: string;
  parsedOutput?: unknown;
  /** Normalizado. `refusal` es el unico valor con significado de control. */
  finishReason: string;
  refusalCategory?: string | null;
  usage: AiUsage;
};

export type AiProviderStreamEvent = { partialJson?: string };

export type AiProviderStream = AsyncIterable<AiProviderStreamEvent> & {
  finalMessage: () => Promise<AiProviderResponse>;
};

export type AiProviderClient = {
  createMessage: (request: AiProviderRequest) => Promise<AiProviderResponse>;
  parseMessage?: (request: AiProviderRequest) => Promise<AiProviderResponse>;
  streamMessage?: (request: AiProviderRequest) => AiProviderStream;
};

export type AiLedgerInput = AiUsage & {
  advisorId: string | null;
  purpose: string;
  model: string;
  latencyMs: number;
  costUsd: number;
  finishReason: string;
  error: string | null;
  promptId: string | null;
};

type AiLedgerResult =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string } };

export type AiGatewayDependencies = {
  client?: AiProviderClient;
  writeCall: (input: AiLedgerInput) => Promise<AiLedgerResult>;
  now?: () => number;
  pricing?: Readonly<Record<string, ModelPricing>>;
};

export type GenerateTextInput = {
  advisorId: string | null;
  purpose: string;
  promptId?: string | null;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
  effort?: AiEffort;
};

export type GenerateStructuredInput<T> = GenerateTextInput & { schema: ZodType<T> };
export type GenerateStructuredStreamInput<T> = GenerateStructuredInput<T> & {
  onDelta: (partialJson: string) => void | Promise<void>;
};

export type AiGatewayError =
  | { code: "AI_REFUSAL"; message: string; category: string | null }
  | {
      code: "AI_PROVIDER_ERROR" | "AI_LEDGER_FAILED" | "AI_EMPTY_RESPONSE";
      message: string;
      /**
       * Si reintentar puede servir. Un 503 de saturacion se recupera solo; una
       * cuota diaria agotada no, y decirle "intenta de nuevo" a una asesora que
       * esta en camara es peor que no decirle nada.
       */
      retryable?: boolean;
    }
  | { code: "AI_QUOTA_EXCEEDED"; message: string; retryable: false };

export type GenerateTextResult =
  | {
      ok: true;
      data: {
        id: string;
        text: string;
        model: string;
        finishReason: string;
        usage: AiUsage;
        costUsd: number;
      };
    }
  | { ok: false; error: AiGatewayError };

export type StructuredAttemptResult<T> =
  | { ok: true; data: { value: T; model: string; usage: AiUsage; costUsd: number } }
  | {
      ok: false;
      error:
        | AiGatewayError
        | {
            code: "AI_INVALID_OUTPUT";
            message: string;
            validationError: string;
            rawText: string;
          };
    };

export type StructuredStreamResult<T> =
  | {
      ok: true;
      data: {
        value: T;
        model: string;
        usage: AiUsage;
        costUsd: number;
        timeToFirstTokenMs: number;
        time_to_first_token_ms: number;
      };
    }
  | {
      ok: false;
      error:
        | AiGatewayError
        | { code: "AI_INVALID_OUTPUT"; message: string }
        | { code: "AI_NO_STREAM_TOKEN"; message: string };
    };

/**
 * Motivos de corte que el proveedor devuelve cuando bloquea la respuesta por
 * politica. Se normalizan a `refusal` porque el gateway ya tenia esa ruta y los
 * consumidores dependen de ella para degradar con cautela — algo que importa
 * mas aqui que en otros dominios, porque las preguntas sobre embarazo,
 * medicamentos o enfermedad son exactamente las que un clasificador de
 * seguridad bloquea.
 */
const REFUSAL_REASONS = new Set([
  "SAFETY",
  "PROHIBITED_CONTENT",
  "BLOCKLIST",
  "SPII",
  "IMAGE_SAFETY",
  "RECITATION",
]);

function normalizeFinishReason(reason: string | undefined) {
  if (!reason) return "unknown";
  if (REFUSAL_REASONS.has(reason)) return "refusal";
  return reason.toLowerCase();
}

const geminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({ parts: z.array(z.object({ text: z.string() }).loose()) }).optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).loose().optional(),
  responseId: z.string().optional(),
  modelVersion: z.string().optional(),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().optional(),
      candidatesTokenCount: z.number().optional(),
      thoughtsTokenCount: z.number().optional(),
      cachedContentTokenCount: z.number().optional(),
    })
    .loose()
    .optional(),
});

type GeminiPayload = z.infer<typeof geminiResponseSchema>;

function usageFromPayload(payload: GeminiPayload): AiUsage {
  const usage = payload.usageMetadata ?? {};
  return {
    inputTokens: usage.promptTokenCount ?? 0,
    // El razonamiento se factura como salida y hay que contarlo, o el ledger
    // subestima el consumo justo en las llamadas que mas gastan.
    outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
    cacheReadTokens: usage.cachedContentTokenCount ?? 0,
    // El proveedor no reporta escritura de cache: su cacheo implicito no la cobra
    // aparte. Se deja en 0 en vez de inventar un numero.
    cacheWriteTokens: 0,
  };
}

function toProviderResponse(payload: GeminiPayload, model: string): AiProviderResponse {
  const candidate = payload.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((part) => part.text)
    .join("")
    .trim();
  const blocked = payload.promptFeedback?.blockReason;
  const finishReason = blocked ? "refusal" : normalizeFinishReason(candidate?.finishReason);
  return {
    id: payload.responseId ?? "sin-id",
    model: payload.modelVersion ?? model,
    text,
    finishReason,
    refusalCategory:
      finishReason === "refusal" ? (blocked ?? candidate?.finishReason ?? null) : null,
    usage: usageFromPayload(payload),
  };
}

function requestBody(request: AiProviderRequest) {
  return {
    contents: request.messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    })),
    systemInstruction: { parts: [{ text: request.system }] },
    generationConfig: {
      maxOutputTokens: request.maxTokens,
      thinkingConfig: { thinkingBudget: THINKING_BUDGET_BY_EFFORT[request.effort] },
      ...(request.jsonSchema
        ? { responseMimeType: "application/json", responseJsonSchema: request.jsonSchema }
        : {}),
    },
  };
}

/**
 * Techo de tiempo por llamada. Sin esto una respuesta que nunca llega cuelga la
 * peticion para siempre: se descubrio asi, con el proveedor saturado. En un tier
 * gratuito el 503 y la lentitud son el caso normal, no la excepcion, y el
 * consumidor prefiere un error tipado en 60 s a una asesora esperando en vivo.
 */
const REQUEST_TIMEOUT_MS = 60_000;

async function callGemini(request: AiProviderRequest, path: string): Promise<Response> {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY no esta definida.");
  let response: Response;
  try {
    response = await fetch(`${AI_PROVIDER.baseUrl}/models/${request.model}:${path}`, {
      method: "POST",
      headers: {
        "x-goog-api-key": env.GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody(request)),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(`El proveedor no respondio en ${REQUEST_TIMEOUT_MS / 1_000}s.`);
    }
    throw error;
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // 429 y 503 son la forma normal de agotar o saturar un tier gratuito: el
    // mensaje conserva el codigo para que el consumidor pueda distinguirlos.
    throw new ProviderHttpError(
      response.status,
      `El proveedor respondio ${response.status}. ${detail.slice(0, 200)}`,
    );
  }
  return response;
}

function defaultClient(): AiProviderClient {
  return {
    async createMessage(request) {
      const response = await callGemini(request, "generateContent");
      const payload = geminiResponseSchema.parse(await response.json());
      return toProviderResponse(payload, request.model);
    },

    async parseMessage(request) {
      const response = await callGemini(request, "generateContent");
      const payload = geminiResponseSchema.parse(await response.json());
      const base = toProviderResponse(payload, request.model);
      let parsedOutput: unknown;
      try {
        parsedOutput = base.text ? JSON.parse(base.text) : undefined;
      } catch {
        parsedOutput = undefined;
      }
      return { ...base, parsedOutput };
    },

    streamMessage(request) {
      let resolveFinal: (value: AiProviderResponse) => void;
      let rejectFinal: (reason: unknown) => void;
      const final = new Promise<AiProviderResponse>((resolve, reject) => {
        resolveFinal = resolve;
        rejectFinal = reject;
      });

      async function* iterate(): AsyncGenerator<AiProviderStreamEvent> {
        try {
          const response = await callGemini(request, "streamGenerateContent?alt=sse");
          const body = response.body;
          if (!body) throw new Error("El proveedor no devolvio cuerpo de stream.");
          const reader = body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let text = "";
          let last: GeminiPayload | undefined;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const raw = line.slice(5).trim();
              if (!raw || raw === "[DONE]") continue;
              const payload = geminiResponseSchema.safeParse(JSON.parse(raw));
              if (!payload.success) continue;
              last = payload.data;
              const chunk = (payload.data.candidates?.[0]?.content?.parts ?? [])
                .map((part) => part.text)
                .join("");
              if (!chunk) continue;
              text += chunk;
              yield { partialJson: chunk };
            }
          }

          if (!last) throw new Error("El stream no produjo ninguna respuesta.");
          const base = toProviderResponse(last, request.model);
          let parsedOutput: unknown;
          try {
            parsedOutput = text ? JSON.parse(text) : undefined;
          } catch {
            parsedOutput = undefined;
          }
          resolveFinal({ ...base, text: text.trim(), parsedOutput });
        } catch (error) {
          rejectFinal(error);
          throw error;
        }
      }

      return Object.assign(iterate(), { finalMessage: () => final });
    },
  };
}

export function calculateCostUsd(usage: AiUsage, pricing: ModelPricing) {
  return (
    (usage.inputTokens * pricing.input +
      usage.outputTokens * pricing.output +
      usage.cacheReadTokens * pricing.cacheRead +
      usage.cacheWriteTokens * pricing.cacheWrite) /
    1_000_000
  );
}

/** Error del proveedor que conserva el estado HTTP para poder clasificarlo. */
class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

function providerErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido del proveedor.";
}

/**
 * Traduce un fallo del proveedor al error que ve el consumidor.
 *
 * La distincion que importa es 429 contra todo lo demas: la cuota gratuita es
 * **por dia y por modelo**, asi que un 429 no se arregla esperando — aunque el
 * proveedor devuelva un `retryDelay` de segundos, que es enganoso. El 503 de
 * saturacion si se recupera solo.
 */
function classifyProviderError(error: unknown): AiGatewayError {
  if (error instanceof ProviderHttpError) {
    if (error.status === 429) {
      return {
        code: "AI_QUOTA_EXCEEDED",
        message: "Se agoto la cuota del proveedor de IA. No sirve reintentar hasta que se renueve.",
        retryable: false,
      };
    }
    return {
      code: "AI_PROVIDER_ERROR",
      message: "El proveedor de IA no respondio.",
      retryable: error.status >= 500 || error.status === 408,
    };
  }
  return {
    code: "AI_PROVIDER_ERROR",
    message: "El proveedor de IA no respondio.",
    retryable: true,
  };
}

function requestParameters(input: GenerateTextInput): AiProviderRequest {
  return {
    model: AI_MODELS.default,
    system: input.system,
    messages: input.messages,
    maxTokens: input.maxTokens,
    effort: input.effort ?? "high",
  };
}

export function createAiGateway(dependencies: AiGatewayDependencies) {
  const now = dependencies.now ?? Date.now;
  const pricingTable = dependencies.pricing ?? MODEL_PRICING_USD_PER_MTOK;

  return {
    async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
      const startedAt = now();
      let response: AiProviderResponse;

      try {
        const client = dependencies.client ?? defaultClient();
        response = await client.createMessage(requestParameters(input));
      } catch (error) {
        const latencyMs = Math.max(0, Math.round(now() - startedAt));
        const message = providerErrorMessage(error);
        const ledger = await dependencies.writeCall({
          advisorId: input.advisorId,
          purpose: input.purpose,
          model: AI_MODELS.default,
          latencyMs,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costUsd: 0,
          finishReason: "error",
          error: message,
          promptId: input.promptId ?? null,
        });
        if (!ledger.ok) {
          return {
            ok: false,
            error: { code: "AI_LEDGER_FAILED", message: "No se pudo auditar la llamada de IA." },
          };
        }
        return { ok: false, error: classifyProviderError(error) };
      }

      const latencyMs = Math.max(0, Math.round(now() - startedAt));
      const usage = response.usage;
      const pricing = pricingTable[response.model];
      const costUsd = pricing ? calculateCostUsd(usage, pricing) : 0;
      const finishReason = response.finishReason;

      const ledger = await dependencies.writeCall({
        advisorId: input.advisorId,
        purpose: input.purpose,
        model: response.model,
        latencyMs,
        ...usage,
        costUsd,
        finishReason,
        error: null,
        promptId: input.promptId ?? null,
      });
      if (!ledger.ok) {
        return {
          ok: false,
          error: { code: "AI_LEDGER_FAILED", message: "No se pudo auditar la llamada de IA." },
        };
      }

      // El rechazo debe decidir el flujo antes de que cualquier consumidor lea content.
      if (response.finishReason === "refusal") {
        return {
          ok: false,
          error: {
            code: "AI_REFUSAL",
            message: "El modelo rechazo responder; usa una degradacion segura.",
            category: response.refusalCategory ?? null,
          },
        };
      }

      const text = response.text;
      if (!text) {
        return {
          ok: false,
          error: { code: "AI_EMPTY_RESPONSE", message: "El modelo no devolvio texto util." },
        };
      }

      return {
        ok: true,
        data: { id: response.id, text, model: response.model, finishReason, usage, costUsd },
      };
    },

    async generateStructuredAttempt<T>(
      input: GenerateStructuredInput<T>,
    ): Promise<StructuredAttemptResult<T>> {
      const startedAt = now();
      let response: AiProviderResponse;

      try {
        const client = dependencies.client ?? defaultClient();
        if (!client.parseMessage)
          throw new Error("El cliente no implementa salidas estructuradas.");
        response = await client.parseMessage({
          ...requestParameters(input),
          jsonSchema: z.toJSONSchema(input.schema),
        });
      } catch (error) {
        const latencyMs = Math.max(0, Math.round(now() - startedAt));
        const message = providerErrorMessage(error);
        const ledger = await dependencies.writeCall({
          advisorId: input.advisorId,
          purpose: input.purpose,
          model: AI_MODELS.default,
          latencyMs,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costUsd: 0,
          finishReason: "error",
          error: message,
          promptId: input.promptId ?? null,
        });
        if (!ledger.ok) {
          return {
            ok: false,
            error: { code: "AI_LEDGER_FAILED", message: "No se pudo auditar la llamada de IA." },
          };
        }
        return { ok: false, error: classifyProviderError(error) };
      }

      const latencyMs = Math.max(0, Math.round(now() - startedAt));
      const usage = response.usage;
      const pricing = pricingTable[response.model];
      const costUsd = pricing ? calculateCostUsd(usage, pricing) : 0;
      const finishReason = response.finishReason;

      // Igual que en texto libre: el rechazo decide antes de inspeccionar la salida.
      if (response.finishReason === "refusal") {
        const ledger = await dependencies.writeCall({
          advisorId: input.advisorId,
          purpose: input.purpose,
          model: response.model,
          latencyMs,
          ...usage,
          costUsd,
          finishReason,
          error: null,
          promptId: input.promptId ?? null,
        });
        if (!ledger.ok) {
          return {
            ok: false,
            error: { code: "AI_LEDGER_FAILED", message: "No se pudo auditar la llamada de IA." },
          };
        }
        return {
          ok: false,
          error: {
            code: "AI_REFUSAL",
            message: "El modelo rechazo responder; usa una degradacion segura.",
            category: response.refusalCategory ?? null,
          },
        };
      }

      const rawText = response.text;
      const parsed = input.schema.safeParse(response.parsedOutput);
      const validationError = parsed.success
        ? null
        : parsed.error.issues
            .map((issue) => `${issue.path.join(".") || "output"}: ${issue.message}`)
            .join("; ");
      const ledger = await dependencies.writeCall({
        advisorId: input.advisorId,
        purpose: input.purpose,
        model: response.model,
        latencyMs,
        ...usage,
        costUsd,
        finishReason,
        error: validationError,
        promptId: input.promptId ?? null,
      });
      if (!ledger.ok) {
        return {
          ok: false,
          error: { code: "AI_LEDGER_FAILED", message: "No se pudo auditar la llamada de IA." },
        };
      }
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: "AI_INVALID_OUTPUT",
            message: "La salida estructurada no cumple el contrato.",
            validationError: validationError ?? "La salida no pudo validarse.",
            rawText,
          },
        };
      }
      return { ok: true, data: { value: parsed.data, model: response.model, usage, costUsd } };
    },

    async generateStructuredStream<T>(
      input: GenerateStructuredStreamInput<T>,
    ): Promise<StructuredStreamResult<T>> {
      const startedAt = now();
      let firstTokenAt: number | undefined;
      let response: AiProviderResponse;

      try {
        const client = dependencies.client ?? defaultClient();
        if (!client.streamMessage) throw new Error("El cliente no implementa streaming.");
        const stream = client.streamMessage({
          ...requestParameters(input),
          jsonSchema: z.toJSONSchema(input.schema),
        });
        for await (const event of stream) {
          const partialJson = event.partialJson;
          if (!partialJson) continue;
          firstTokenAt ??= now();
          await input.onDelta(partialJson);
        }
        response = await stream.finalMessage();
      } catch (error) {
        const latencyMs = Math.max(0, Math.round(now() - startedAt));
        const message = providerErrorMessage(error);
        const ledger = await dependencies.writeCall({
          advisorId: input.advisorId,
          purpose: input.purpose,
          model: AI_MODELS.default,
          latencyMs,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costUsd: 0,
          finishReason: "error",
          error: message,
          promptId: input.promptId ?? null,
        });
        if (!ledger.ok) {
          return {
            ok: false,
            error: { code: "AI_LEDGER_FAILED", message: "No se pudo auditar la llamada de IA." },
          };
        }
        return { ok: false, error: classifyProviderError(error) };
      }

      const latencyMs = Math.max(0, Math.round(now() - startedAt));
      const usage = response.usage;
      const pricing = pricingTable[response.model];
      const costUsd = pricing ? calculateCostUsd(usage, pricing) : 0;
      const finishReason = response.finishReason;
      if (response.finishReason === "refusal") {
        const ledger = await dependencies.writeCall({
          advisorId: input.advisorId,
          purpose: input.purpose,
          model: response.model,
          latencyMs,
          ...usage,
          costUsd,
          finishReason,
          error: null,
          promptId: input.promptId ?? null,
        });
        if (!ledger.ok) {
          return {
            ok: false,
            error: { code: "AI_LEDGER_FAILED", message: "No se pudo auditar la llamada de IA." },
          };
        }
        return {
          ok: false,
          error: {
            code: "AI_REFUSAL",
            message: "El modelo rechazo responder; usa una degradacion segura.",
            category: response.refusalCategory ?? null,
          },
        };
      }
      const parsed = input.schema.safeParse(response.parsedOutput);
      const validationError = parsed.success ? null : parsed.error.message;
      const ledger = await dependencies.writeCall({
        advisorId: input.advisorId,
        purpose: input.purpose,
        model: response.model,
        latencyMs,
        ...usage,
        costUsd,
        finishReason,
        error: validationError,
        promptId: input.promptId ?? null,
      });
      if (!ledger.ok) {
        return {
          ok: false,
          error: { code: "AI_LEDGER_FAILED", message: "No se pudo auditar la llamada de IA." },
        };
      }
      if (!firstTokenAt) {
        return {
          ok: false,
          error: { code: "AI_NO_STREAM_TOKEN", message: "La respuesta no produjo contenido." },
        };
      }
      if (!parsed.success) {
        return {
          ok: false,
          error: { code: "AI_INVALID_OUTPUT", message: "La salida no cumple el contrato." },
        };
      }
      return {
        ok: true,
        data: {
          value: parsed.data,
          model: response.model,
          usage,
          costUsd,
          timeToFirstTokenMs: Math.max(0, Math.round(firstTokenAt - startedAt)),
          time_to_first_token_ms: Math.max(0, Math.round(firstTokenAt - startedAt)),
        },
      };
    },
  };
}

export type AiGateway = ReturnType<typeof createAiGateway>;
