import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AI_MODELS } from "../../src/lib/ai/config.ts";
import {
  type AiLedgerInput,
  type AiProviderClient,
  type AiProviderResponse,
  calculateCostUsd,
  createAiGateway,
} from "../../src/lib/ai/gateway.ts";

const usage = {
  inputTokens: 1_000,
  outputTokens: 200,
  cacheReadTokens: 300,
  cacheWriteTokens: 400,
};

function providerResponse(overrides: Partial<AiProviderResponse> = {}): AiProviderResponse {
  return {
    id: "msg_test",
    model: AI_MODELS.default,
    finishReason: "stop",
    refusalCategory: null,
    text: "Respuesta segura",
    usage,
    ...overrides,
  };
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

/**
 * Precios inyectados a proposito. El despliegue actual corre en un tier gratuito
 * y su tabla real esta en cero, asi que asertar contra ella no probaria nada: la
 * aritmetica de costos pasaria aunque estuviera rota. Con precios propios la
 * prueba sigue verificando la formula el dia que se pase a un plan pago.
 */
const testPricing = {
  [AI_MODELS.default]: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
};

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
      pricing: testPricing,
    });

    const result = await gateway.generateText(request());

    expect(result).toEqual({
      ok: true,
      data: {
        id: "msg_test",
        text: "Respuesta segura",
        model: AI_MODELS.default,
        finishReason: "stop",
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
        finishReason: "stop",
        error: null,
        promptId: null,
      },
    ]);
    // La peticion que sale del gateway es NEUTRAL de proveedor: si algun dia
    // vuelve a filtrarse un campo especifico de un vendor, esta asercion lo ve.
    expect(requests[0]).toMatchObject({
      model: AI_MODELS.default,
      system: "Responde solo con informacion verificada.",
      maxTokens: 500,
      effort: "high",
    });
    expect(Object.keys(requests[0] ?? {}).sort()).toEqual([
      "effort",
      "maxTokens",
      "messages",
      "model",
      "system",
    ]);
  });

  it("detects a refusal before reading content and returns a discriminated error", async () => {
    const refused = providerResponse({
      finishReason: "refusal",
      refusalCategory: "SAFETY",
    });
    // El texto no debe leerse antes de resolver el rechazo: en este dominio la
    // respuesta bloqueada suele ser sobre embarazo o medicamentos, y usarla
    // igual seria justo el fallo que la ruta de rechazo existe para evitar.
    Object.defineProperty(refused, "text", {
      get: () => {
        throw new Error("text se leyo antes de manejar refusal");
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
        category: "SAFETY",
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
      error: {
        code: "AI_PROVIDER_ERROR",
        message: "El proveedor de IA no respondio.",
        // Un error de red sin estado HTTP se asume transitorio: reintentar es
        // consejo honesto. Lo que nunca debe marcarse asi es una cuota agotada.
        retryable: true,
      },
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

describe("clasificacion de errores del proveedor", () => {
  async function failWith(status: number, body: string) {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(body, { status })) as unknown as typeof globalThis.fetch;
    const previousKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "llave-de-prueba";
    try {
      const gateway = createAiGateway({ writeCall: successfulLedger().writeCall });
      return await gateway.generateText(request());
    } finally {
      globalThis.fetch = original;
      process.env.GEMINI_API_KEY = previousKey;
    }
  }

  it("un 429 es cuota agotada y NO es reintentable", async () => {
    const result = await failWith(429, '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("AI_QUOTA_EXCEEDED");
    expect("retryable" in result.error && result.error.retryable).toBe(false);
  });

  it("un 503 de saturacion si es reintentable", async () => {
    const result = await failWith(503, '{"error":{"code":503,"status":"UNAVAILABLE"}}');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("AI_PROVIDER_ERROR");
    expect("retryable" in result.error && result.error.retryable).toBe(true);
  });

  it("un 400 no es reintentable: la peticion esta mal y seguira mal", async () => {
    const result = await failWith(400, '{"error":{"code":400}}');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect("retryable" in result.error && result.error.retryable).toBe(false);
  });
});

describe("stream SSE del proveedor", () => {
  /** Arma una respuesta SSE cuyo ULTIMO evento no termina en salto de linea. */
  function sseResponse(payloads: string[], trailingNewline: boolean) {
    const body = payloads.map((p) => `data: ${p}`).join("\n") + (trailingNewline ? "\n" : "");
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }

  function chunkPayload(text: string, finish?: string) {
    return JSON.stringify({
      candidates: [{ content: { parts: [{ text }] }, ...(finish ? { finishReason: finish } : {}) }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      modelVersion: AI_MODELS.default,
    });
  }

  async function streamWith(trailingNewline: boolean) {
    const original = globalThis.fetch;
    const previousKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "llave-de-prueba";
    globalThis.fetch = (async () =>
      sseResponse(
        [chunkPayload('{"answer":"ho'), chunkPayload('la"}', "STOP")],
        trailingNewline,
      )) as unknown as typeof globalThis.fetch;
    try {
      const gateway = createAiGateway({ writeCall: successfulLedger().writeCall });
      return await gateway.generateStructuredStream({
        ...request(),
        schema: z.object({ answer: z.string() }),
        onDelta: () => undefined,
      });
    } finally {
      globalThis.fetch = original;
      process.env.GEMINI_API_KEY = previousKey;
    }
  }

  it("no pierde el ultimo evento cuando el stream cierra sin salto final", async () => {
    // Regresion real: sin vaciar el buffer al terminar, el JSON llegaba cortado
    // a media frase y fallaba la validacion con el stream aparentemente sano.
    const result = await streamWith(false);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.value).toEqual({ answer: "hola" });
  });

  it("tambien funciona cuando el stream cierra con salto final", async () => {
    const result = await streamWith(true);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.value).toEqual({ answer: "hola" });
  });
});
