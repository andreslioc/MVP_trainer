import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaMessage,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";

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
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
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
      error:
        | {
            code: "AI_REFUSAL";
            message: string;
            category: string | null;
          }
        | {
            code: "AI_PROVIDER_ERROR" | "AI_LEDGER_FAILED" | "AI_EMPTY_RESPONSE";
            message: string;
          };
    };

function defaultClient(): AiProviderClient {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY no esta definida.");
  }
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return {
    createMessage: (request) => client.beta.messages.create(request),
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

export function createAiGateway(dependencies: AiGatewayDependencies) {
  const now = dependencies.now ?? Date.now;
  const pricingTable = dependencies.pricing ?? MODEL_PRICING_USD_PER_MTOK;

  return {
    async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
      const startedAt = now();
      let response: AiProviderResponse;

      try {
        const client = dependencies.client ?? defaultClient();
        response = await client.createMessage({
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

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
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
  };
}
