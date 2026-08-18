import { describe, expect, it, vi } from "vitest";

import { AI_MODELS } from "../../src/lib/ai/config.ts";
import {
  type AiLedgerInput,
  type AiProviderClient,
  type AiProviderResponse,
  calculateCostUsd,
  createAiGateway,
} from "../../src/lib/ai/gateway.ts";

const usage = {
  input_tokens: 1_000,
  output_tokens: 200,
  cache_read_input_tokens: 300,
  cache_creation_input_tokens: 400,
};

function providerResponse(overrides: Partial<AiProviderResponse> = {}): AiProviderResponse {
  return {
    id: "msg_test",
    model: AI_MODELS.default,
    stop_reason: "end_turn",
    stop_details: null,
    content: [{ type: "text", text: "Respuesta segura", citations: null }],
    usage,
    ...overrides,
  } as AiProviderResponse;
}

function request() {
  return {
    advisorId: "11111111-1111-4111-8111-111111111111",
    purpose: "copilot_compose",
    promptId: null,
    system: "Responde solo con informacion verificada.",
    messages: [{ role: "user" as const, content: "¿Como se usa?" }],
    maxTokens: 500,
  };
}

function successfulLedger() {
  const calls: AiLedgerInput[] = [];
  return {
    calls,
    writeCall: async (input: AiLedgerInput) => {
      calls.push(input);
      return { ok: true as const, data: { id: "ledger_test" } };
    },
  };
}

describe("AI gateway", () => {
  it("persists provider usage, latency, cache, cost and finish reason", async () => {
    const requests: Parameters<AiProviderClient["createMessage"]>[0][] = [];
    const client: AiProviderClient = {
      createMessage: async (input) => {
        requests.push(input);
        return providerResponse();
      },
    };
    const ledger = successfulLedger();
    let timeIndex = 0;
    const times = [1_000, 1_042];
    const gateway = createAiGateway({
      client,
      writeCall: ledger.writeCall,
      now: () => times[timeIndex++] ?? 1_042,
    });

    const result = await gateway.generateText(request());

    expect(result).toEqual({
      ok: true,
      data: {
        id: "msg_test",
        text: "Respuesta segura",
        model: AI_MODELS.default,
        finishReason: "end_turn",
        usage: {
          inputTokens: 1_000,
          outputTokens: 200,
          cacheReadTokens: 300,
          cacheWriteTokens: 400,
        },
        costUsd: 0.01265,
      },
    });
    expect(ledger.calls).toEqual([
      {
        advisorId: request().advisorId,
        purpose: "copilot_compose",
        model: AI_MODELS.default,
        latencyMs: 42,
        inputTokens: 1_000,
        outputTokens: 200,
        cacheReadTokens: 300,
        cacheWriteTokens: 400,
        costUsd: 0.01265,
        finishReason: "end_turn",
        error: null,
        promptId: null,
      },
    ]);
    expect(requests[0]).toMatchObject({
      model: AI_MODELS.default,
      fallbacks: "default",
      betas: ["server-side-fallback-2026-07-01"],
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      system: [{ cache_control: { type: "ephemeral" } }],
    });
  });

  it("detects a refusal before reading content and returns a discriminated error", async () => {
    const refused = providerResponse({
      stop_reason: "refusal",
      stop_details: {
        category: "general_harms",
        explanation: "Solicitud rechazada",
        fallback_credit_token: null,
        fallback_has_prefill_claim: null,
        recommended_model: null,
        type: "refusal",
      },
    });
    Object.defineProperty(refused, "content", {
      get: () => {
        throw new Error("content se leyo antes de manejar refusal");
      },
    });
    const ledger = successfulLedger();
    const gateway = createAiGateway({
      client: { createMessage: async () => refused },
      writeCall: ledger.writeCall,
      now: () => 10,
    });

    const result = await gateway.generateText(request());

    expect(result).toEqual({
      ok: false,
      error: {
        code: "AI_REFUSAL",
        message: "El modelo rechazo responder; usa una degradacion segura.",
        category: "general_harms",
      },
    });
    expect(ledger.calls[0]?.finishReason).toBe("refusal");
  });

  it("persists a provider error without requiring an API key", async () => {
    const ledger = successfulLedger();
    const client: AiProviderClient = {
      createMessage: async () => {
        throw new Error("timeout de prueba");
      },
    };
    const gateway = createAiGateway({ client, writeCall: ledger.writeCall, now: () => 20 });

    const result = await gateway.generateText(request());

    expect(result).toEqual({
      ok: false,
      error: { code: "AI_PROVIDER_ERROR", message: "El proveedor de IA no respondio." },
    });
    expect(ledger.calls[0]).toMatchObject({
      finishReason: "error",
      error: "timeout de prueba",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    });
  });

  it("calculates every provider-reported token category", () => {
    expect(
      calculateCostUsd(
        { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 },
        { input: 10, output: 20, cacheRead: 2, cacheWrite: 12 },
      ),
    ).toBe(0.000104);
  });

  it("does not return unlogged content when the ledger fails", async () => {
    const gateway = createAiGateway({
      client: { createMessage: async () => providerResponse() },
      writeCall: vi.fn(async () => ({
        ok: false as const,
        error: { code: "LLM_CALL_WRITE_FAILED", message: "fallo" },
      })),
      now: () => 30,
    });

    await expect(gateway.generateText(request())).resolves.toEqual({
      ok: false,
      error: { code: "AI_LEDGER_FAILED", message: "No se pudo auditar la llamada de IA." },
    });
  });
});
