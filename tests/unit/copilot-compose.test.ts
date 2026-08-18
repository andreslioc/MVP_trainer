import { describe, expect, it } from "vitest";

import { AI_MODELS } from "../../src/lib/ai/config.ts";
import {
  type AiProviderResponse,
  type AiProviderStream,
  createAiGateway,
} from "../../src/lib/ai/gateway.ts";
import {
  buildCopilotClassifyPrompt,
  buildCopilotComposePrompt,
} from "../../src/lib/ai/prompts/copilot.ts";
import { copilotCompositionSchema, copilotIntentSchema } from "../../src/lib/ai/schemas.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import {
  asksForMissingSensitiveFact,
  estimateDurationSeconds,
  safeCopilotFallback,
} from "../../src/server/copilot/compose.ts";
import { validProductInput } from "../fixtures/product.ts";

const composition = {
  intent: "informacion" as const,
  express: "Respuesta directa con datos verificados y un cierre claro para la clienta.",
  estandar: "Respuesta estándar sustentada únicamente en la ficha seleccionada.",
  profunda: "Respuesta profunda sustentada únicamente en la ficha seleccionada.",
  confidence: "alto" as const,
  cta_used: "Consulta disponibilidad por WhatsApp",
  rule_applied: "canal_whatsapp",
};

function product() {
  const value = productInputSchema.parse(
    validProductInput({ verifiedAt: new Date("2026-08-18T12:00:00Z") }),
  );
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ...value,
    verifiedAt: new Date("2026-08-18T12:00:00Z"),
    createdAt: new Date("2026-08-18T12:00:00Z"),
    updatedAt: new Date("2026-08-18T12:00:00Z"),
  };
}

describe("Copilot composition", () => {
  it("classifies only known intents and encodes the six ordered response parts", () => {
    expect(copilotIntentSchema.parse({ intent: "objecion" })).toEqual({ intent: "objecion" });
    expect(copilotIntentSchema.safeParse({ intent: "inventada" }).success).toBe(false);

    const classify = buildCopilotClassifyPrompt("¿Por qué debería comprarlo?");
    const compose = buildCopilotComposePrompt({
      product: product(),
      activeRules: [{ key: "canal_whatsapp", value: { cta: composition.cta_used } }],
      customerQuestion: "¿Qué contiene?",
      intent: "informacion",
      objective: "informar",
      tone: "cercano",
      orchestration: {
        cta: { text: composition.cta_used, ruleKey: "canal_whatsapp" },
        incentive: null,
        ruleApplied: "canal_whatsapp",
      },
    });
    expect(classify.system).toContain("informacion, comparacion, precio");
    for (const part of [
      "1. Respuesta directa",
      "2. Dos o tres beneficios",
      "3. Razon cientifica",
      "4. Diferencial verificable",
      "5. Urgencia",
      "6. Un solo llamado",
    ]) {
      expect(compose.system).toContain(part);
    }
    expect(compose.system).toContain("Magnesio de prueba");
    expect(compose.system).toContain("canal_whatsapp");
  });

  it("uses a cautious fallback instead of completing absent facts", () => {
    expect(asksForMissingSensitiveFact("¿Cuál es el precio?", product())).toBe(true);
    expect(asksForMissingSensitiveFact("¿Tiene certificación FDA?", product())).toBe(true);
    const fallback = safeCopilotFallback("precio");
    expect(fallback.express).toContain("no está verificado");
    expect(fallback.confidence).toBe("revisar");
    expect(fallback.cta_used).toBeNull();
  });

  it("streams a structured result with local first token under 250 ms", async () => {
    const response = {
      id: "msg_stream",
      model: AI_MODELS.default,
      finishReason: "stop",
      refusalCategory: null,
      text: JSON.stringify(composition),
      usage: {
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      parsedOutput: composition,
    } satisfies AiProviderResponse;
    const stream = {
      async *[Symbol.asyncIterator]() {
        yield { partialJson: JSON.stringify(composition) };
      },
      finalMessage: async () => response,
    } satisfies AiProviderStream;
    let timeIndex = 0;
    const times = [1_000, 1_100, 1_200];
    const chunks: string[] = [];
    const gateway = createAiGateway({
      client: {
        createMessage: async () => response,
        streamMessage: () => stream,
      },
      writeCall: async () => ({ ok: true as const, data: {} }),
      now: () => times[timeIndex++] ?? 1_200,
    });

    const result = await gateway.generateStructuredStream({
      advisorId: null,
      purpose: "copilot_compose",
      schema: copilotCompositionSchema,
      system: "Sistema",
      messages: [{ role: "user", content: "Pregunta" }],
      maxTokens: 64_000,
      effort: "low",
      onDelta: (chunk) => {
        chunks.push(chunk);
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.value).toEqual(composition);
    expect(result.data.timeToFirstTokenMs).toBeLessThan(250);
    expect(result.data.time_to_first_token_ms).toBeLessThan(250);
    expect(chunks.join("")).toContain("Respuesta directa");
    expect(estimateDurationSeconds(composition.express)).toBeGreaterThan(0);
  });
});
