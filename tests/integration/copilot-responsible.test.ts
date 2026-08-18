import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import {
  advisors,
  copilotExchanges,
  liveSessions,
  llmCalls,
  products,
  prompts,
} from "../../src/db/schema.ts";
import {
  createAiGateway,
  type AiProviderResponse,
  type AiProviderStream,
} from "../../src/lib/ai/gateway.ts";
import type { CopilotComposition } from "../../src/lib/ai/schemas.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import {
  composeCopilotAnswer,
  type ComposeDependencies,
} from "../../src/server/copilot/compose.ts";
import { writeLlmCall } from "../../src/server/llm-calls.ts";
import { validProductInput } from "../fixtures/product.ts";

const connection = openDirectDatabase("test");
const advisorId = randomUUID();
const productId = randomUUID();
const sessionId = randomUUID();
const promptVersion = Number.parseInt(randomUUID().slice(0, 7), 16);
const authorize = async () => ({
  ok: true as const,
  data: { id: advisorId, role: "asesor" as const },
});

const request = (customerQuestion: string) => ({
  liveSessionId: sessionId,
  productId,
  customerQuestion,
  lengthVariant: "express" as const,
  objective: "orientar con responsabilidad",
  tone: "cercano",
});

function parseOrchestration(input: { messages: Array<{ content: string }> }) {
  const line = input.messages[0]?.content
    .split("\n")
    .find((candidate) => candidate.startsWith("ORQUESTACION COMERCIAL: "));
  return JSON.parse(line?.slice("ORQUESTACION COMERCIAL: ".length) ?? "{}") as {
    cta: { text: string } | null;
    ruleApplied: string | null;
  };
}

function generatedComposition(
  input: { messages: Array<{ content: string }> },
  answer: string,
): CopilotComposition {
  const orchestration = parseOrchestration(input);
  return {
    intent: "informacion",
    express: answer,
    estandar: answer,
    profunda: answer,
    confidence: "alto",
    cta_used: orchestration.cta?.text ?? null,
    rule_applied: orchestration.ruleApplied,
  };
}

function successfulStream(answer: string) {
  return async (input: Parameters<NonNullable<ComposeDependencies["stream"]>>[0]) => {
    const value = generatedComposition(input, answer);
    await input.onDelta(JSON.stringify(value));
    return {
      ok: true as const,
      data: {
        value,
        model: "fake",
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
        costUsd: 0,
        timeToFirstTokenMs: 5,
        time_to_first_token_ms: 5,
      },
    };
  };
}

beforeAll(async () => {
  await connection.db.insert(advisors).values({
    id: advisorId,
    email: `${advisorId}@responsible.test`,
    displayName: "Responsible Copilot",
  });
  await connection.db.insert(products).values({
    id: productId,
    ...productInputSchema.parse(
      validProductInput({ verifiedAt: new Date("2026-08-18T12:00:00Z") }),
    ),
  });
  await connection.db.insert(liveSessions).values({ id: sessionId, advisorId });
  await connection.db.insert(prompts).values([
    {
      name: "copilot_classify",
      version: promptVersion,
      body: "Clasificador responsable",
      active: true,
    },
    {
      name: "copilot_compose_express",
      version: promptVersion,
      body: "Compositor responsable",
      active: true,
    },
  ]);
});

afterAll(async () => {
  await connection.db.delete(llmCalls).where(eq(llmCalls.advisorId, advisorId));
  await connection.db.delete(liveSessions).where(eq(liveSessions.id, sessionId));
  await connection.db.delete(products).where(eq(products.id, productId));
  for (const name of ["copilot_classify", "copilot_compose_express"]) {
    await connection.db
      .delete(prompts)
      .where(and(eq(prompts.name, name), eq(prompts.version, promptVersion)));
  }
  await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
  await connection.close();
});

describe("Copilot responsible communication", () => {
  it("blocks a prohibited claim before streaming or persistence and names the alert", async () => {
    const question = `¿Qué hace el producto? ${randomUUID()}`;
    const [beforeSession] = await connection.db
      .select()
      .from(liveSessions)
      .where(eq(liveSessions.id, sessionId));
    const onChunk = vi.fn();

    const result = await composeCopilotAnswer(request(question), {
      authorize,
      database: connection.db,
      classify: async () => ({
        ok: true,
        data: { value: { intent: "informacion" }, repaired: false },
      }),
      stream: successfulStream("Cura enfermedades."),
      onChunk,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "RESPONSIBLE_CONTENT_BLOCKED",
        alerts: [{ code: "PROHIBITED_CLAIM" }],
      },
    });
    expect(onChunk).not.toHaveBeenCalled();
    const persisted = await connection.db
      .select()
      .from(copilotExchanges)
      .where(eq(copilotExchanges.customerQuestion, question));
    const [afterSession] = await connection.db
      .select()
      .from(liveSessions)
      .where(eq(liveSessions.id, sessionId));
    expect(persisted).toEqual([]);
    expect(afterSession?.ctasUsed).toEqual(beforeSession?.ctasUsed);
    expect(afterSession?.promosMentioned).toEqual(beforeSession?.promosMentioned);
  });

  it("replaces an affirmative health answer and persists caution with revisar", async () => {
    const question = `¿Me lo recomienda durante el embarazo? ${randomUUID()}`;
    const result = await composeCopilotAnswer(request(question), {
      authorize,
      database: connection.db,
      classify: async () => ({
        ok: true,
        data: { value: { intent: "informacion" }, repaired: false },
      }),
      stream: successfulStream("Sí, te lo recomiendo sin ninguna precaución."),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.exchange).toMatchObject({
      confidence: "revisar",
      ctaUsed: null,
      ruleApplied: null,
      alerts: [{ code: "HEALTH_CAUTION" }],
    });
    expect(result.data.exchange.answerText).toContain("profesional de salud");
    expect(result.data.exchange.answerText).not.toContain("Sí, te lo recomiendo");
  });

  it("persists a safe answer while retaining provider refusal in the LLM ledger", async () => {
    const response = {
      id: `msg_${randomUUID()}`,
      model: "gemini-3-flash-preview",
      text: "",
      finishReason: "refusal",
      refusalCategory: "SAFETY",
      usage: { inputTokens: 2, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
    } as unknown as AiProviderResponse;
    Object.defineProperty(response, "parsedOutput", {
      get: () => {
        throw new Error("parsedOutput no debe leerse tras un rechazo");
      },
    });
    const providerStream = {
      async *[Symbol.asyncIterator]() {},
      finalMessage: async () => response,
    } as AiProviderStream;
    const gateway = createAiGateway({
      client: { createMessage: vi.fn(), streamMessage: () => providerStream },
      writeCall: (input) => writeLlmCall(input, { database: connection.db }),
    });
    const question = `¿Qué aporta? ${randomUUID()}`;

    const result = await composeCopilotAnswer(request(question), {
      authorize,
      database: connection.db,
      classify: async () => ({
        ok: true,
        data: { value: { intent: "informacion" }, repaired: false },
      }),
      stream: (input) => gateway.generateStructuredStream(input),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.exchange.answerText).not.toHaveLength(0);
    expect(result.data.exchange).toMatchObject({
      confidence: "revisar",
      alerts: [{ code: "AI_REFUSAL" }],
    });
    const calls = await connection.db
      .select()
      .from(llmCalls)
      .where(and(eq(llmCalls.advisorId, advisorId), eq(llmCalls.purpose, "copilot_compose")));
    expect(calls.at(-1)?.finishReason).toBe("refusal");
  });
});
