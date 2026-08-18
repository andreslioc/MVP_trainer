import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AI_MODELS } from "../../src/lib/ai/config.ts";
import {
  type AiLedgerInput,
  type AiParsedProviderResponse,
  type AiProviderClient,
  createAiGateway,
} from "../../src/lib/ai/gateway.ts";
import { generateStructured } from "../../src/lib/ai/structured.ts";

const answerSchema = z.object({ answer: z.string().trim().min(1) });

function parsedResponse(parsedOutput: unknown, rawText: string): AiParsedProviderResponse {
  return {
    id: "msg_structured",
    model: AI_MODELS.default,
    stop_reason: "end_turn",
    stop_details: null,
    content: [{ type: "text", text: rawText, citations: null }],
    parsed_output: parsedOutput,
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      cache_read_input_tokens: 30,
      cache_creation_input_tokens: 40,
    },
  } as AiParsedProviderResponse;
}

function input() {
  return {
    advisorId: "11111111-1111-4111-8111-111111111111",
    purpose: "generate_questions",
    promptId: null,
    system: "Entrega una respuesta estructurada.",
    messages: [{ role: "user" as const, content: "Responde la pregunta." }],
    maxTokens: 1_000,
    schema: answerSchema,
  };
}

function harness(responses: AiParsedProviderResponse[]) {
  const requests: Parameters<NonNullable<AiProviderClient["parseMessage"]>>[0][] = [];
  const ledgerCalls: AiLedgerInput[] = [];
  const client: AiProviderClient = {
    createMessage: async () => {
      throw new Error("Esta prueba solo usa parseMessage.");
    },
    parseMessage: async (request) => {
      requests.push(request);
      const response = responses.shift();
      if (!response) throw new Error("Se intento una reparacion adicional.");
      return response;
    },
  };
  const gateway = createAiGateway({
    client,
    now: () => 100,
    writeCall: async (call) => {
      ledgerCalls.push(call);
      return { ok: true as const, data: { id: `call-${ledgerCalls.length}` } };
    },
  });
  return { gateway, ledgerCalls, requests };
}

describe("structured AI output", () => {
  it("returns a valid parsed value without retrying", async () => {
    const test = harness([parsedResponse({ answer: "Valida" }, '{"answer":"Valida"}')]);

    const result = await generateStructured(input(), test.gateway);

    expect(result).toEqual({
      ok: true,
      data: { value: { answer: "Valida" }, repaired: false },
    });
    expect(test.requests).toHaveLength(1);
    expect(test.ledgerCalls).toHaveLength(1);
    expect(test.requests[0]?.output_config?.format).toMatchObject({ type: "json_schema" });
  });

  it("repairs once with the validation error and persists both attempts", async () => {
    const test = harness([
      parsedResponse(null, "{}"),
      parsedResponse({ answer: "Reparada" }, '{"answer":"Reparada"}'),
    ]);

    const result = await generateStructured(input(), test.gateway);

    expect(result).toEqual({
      ok: true,
      data: { value: { answer: "Reparada" }, repaired: true },
    });
    expect(test.requests).toHaveLength(2);
    expect(test.ledgerCalls).toHaveLength(2);
    expect(test.ledgerCalls[0]?.error).toContain("output");
    expect(test.requests[1]?.messages.at(-1)).toMatchObject({
      role: "user",
      content: expect.stringContaining("Error de validacion:"),
    });
  });

  it("stops after one failed repair and exposes no partial value", async () => {
    const test = harness([
      parsedResponse(null, "primer parcial"),
      parsedResponse(null, "segundo parcial"),
    ]);

    const result = await generateStructured(input(), test.gateway);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "AI_INVALID_OUTPUT",
        message: "La salida de IA siguio siendo invalida despues de una reparacion.",
      },
    });
    expect(test.requests).toHaveLength(2);
    expect(test.ledgerCalls).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain("segundo parcial");
  });
});
