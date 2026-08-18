import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type {
  BetaMessage,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ZodType } from "zod";

import { env } from "../env.ts";
import { AI_CONFIG, AI_MODELS, MODEL_PRICING_USD_PER_MTOK, type ModelPricing } from "./config.ts";

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type AiProviderResponse = Pick<
  BetaMessage,
  "content" | "id" | "model" | "stop_details" | "stop_reason" | "usage"
>;

export type AiProviderClient = {
  createMessage: (request: MessageCreateParamsNonStreaming) => Promise<AiProviderResponse>;
  parseMessage?: (request: MessageCreateParamsNonStreaming) => Promise<AiParsedProviderResponse>;
};

export type AiParsedProviderResponse = AiProviderResponse & { parsed_output: unknown };

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
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
};

export type GenerateStructuredInput<T> = GenerateTextInput & { schema: ZodType<T> };

export type AiGatewayError =
  | {
      code: "AI_REFUSAL";
      message: string;
      category: string | null;
    }
  | {
      code: "AI_PROVIDER_ERROR" | "AI_LEDGER_FAILED" | "AI_EMPTY_RESPONSE";
      message: string;
    };

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
  | {
      ok: false;
      error: AiGatewayError;
    };

export type StructuredAttemptResult<T> =
  | {
      ok: true;
      data: {
        value: T;
        model: string;
        usage: AiUsage;
        costUsd: number;
      };
    }
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

function defaultClient(): AiProviderClient {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY no esta definida.");
  }
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return {
    createMessage: (request) => client.beta.messages.create(request),
    parseMessage: (request) => client.beta.messages.parse(request),
  };
}

function providerUsage(response: AiProviderResponse): AiUsage {
  return {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
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

function providerErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido del proveedor.";
}

function requestParameters(input: GenerateTextInput): MessageCreateParamsNonStreaming {
  return {
    model: AI_MODELS.default,
    max_tokens: input.maxTokens,
    messages: input.messages,
    system: [
      {
        type: "text",
        text: input.system,
        cache_control: { type: "ephemeral" },
      },
    ],
    thinking: { type: "adaptive" },
    output_config: { effort: input.effort ?? "high" },
    fallbacks: AI_CONFIG.fallback,
    betas: [...AI_CONFIG.betaHeaders],
  };
}

function responseText(response: AiProviderResponse) {
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
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
        return {
          ok: false,
          error: { code: "AI_PROVIDER_ERROR", message: "El proveedor de IA no respondio." },
        };
      }

      const latencyMs = Math.max(0, Math.round(now() - startedAt));
      const usage = providerUsage(response);
      const pricing = pricingTable[response.model];
      const costUsd = pricing ? calculateCostUsd(usage, pricing) : 0;
      const finishReason = response.stop_reason ?? "unknown";

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
      if (response.stop_reason === "refusal") {
        return {
          ok: false,
          error: {
            code: "AI_REFUSAL",
            message: "El modelo rechazo responder; usa una degradacion segura.",
            category: response.stop_details?.category ?? null,
          },
        };
      }

      const text = responseText(response);
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
      let response: AiParsedProviderResponse;

      try {
        const client = dependencies.client ?? defaultClient();
        if (!client.parseMessage)
          throw new Error("El cliente no implementa salidas estructuradas.");
        const request = requestParameters(input);
        response = await client.parseMessage({
          ...request,
          output_config: {
            ...request.output_config,
            format: zodOutputFormat(input.schema),
          },
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
        return {
          ok: false,
          error: { code: "AI_PROVIDER_ERROR", message: "El proveedor de IA no respondio." },
        };
      }

      const latencyMs = Math.max(0, Math.round(now() - startedAt));
      const usage = providerUsage(response);
      const pricing = pricingTable[response.model];
      const costUsd = pricing ? calculateCostUsd(usage, pricing) : 0;
      const finishReason = response.stop_reason ?? "unknown";

      // Igual que en texto libre: stop_reason decide antes de inspeccionar content.
      if (response.stop_reason === "refusal") {
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
            category: response.stop_details?.category ?? null,
          },
        };
      }

      const rawText = responseText(response);
      const parsed = input.schema.safeParse(response.parsed_output);
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
  };
}

export type AiGateway = ReturnType<typeof createAiGateway>;
