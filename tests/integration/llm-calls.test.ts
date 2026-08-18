import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import { advisors, llmCalls } from "../../src/db/schema.ts";
import { writeLlmCall } from "../../src/server/llm-calls.ts";

const connection = openDirectDatabase("test");
const advisorId = randomUUID();
const createdCallIds: string[] = [];

afterAll(async () => {
  for (const id of createdCallIds) {
    await connection.db.delete(llmCalls).where(eq(llmCalls.id, id));
  }
  await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
  await connection.close();
});

describe("LLM usage ledger", () => {
  it("persists a complete trace attributed to the advisor", async () => {
    await connection.db.insert(advisors).values({
      id: advisorId,
      email: `ledger-${advisorId}@example.com`,
      displayName: "Ledger Test",
    });

    const result = await writeLlmCall(
      {
        advisorId,
        purpose: "evaluate_answer",
        model: "provider-model-used",
        latencyMs: 321,
        inputTokens: 1_200,
        outputTokens: 345,
        cacheReadTokens: 678,
        cacheWriteTokens: 90,
        costUsd: 0.0198764,
        finishReason: "end_turn",
        error: null,
        promptId: null,
      },
      { database: connection.db },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdCallIds.push(result.data.id);

    const [persisted] = await connection.db
      .select()
      .from(llmCalls)
      .where(eq(llmCalls.id, result.data.id));
    expect(persisted).toMatchObject({
      advisorId,
      purpose: "evaluate_answer",
      model: "provider-model-used",
      latencyMs: 321,
      inputTokens: 1_200,
      outputTokens: 345,
      cacheReadTokens: 678,
      cacheWriteTokens: 90,
      costUsd: "0.019876",
      finishReason: "end_turn",
      error: null,
      promptId: null,
    });
  });

  it("rejects invalid traces before inserting", async () => {
    const result = await writeLlmCall(
      {
        advisorId: null,
        purpose: "copilot_compose",
        model: "provider-model-used",
        latencyMs: -1,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costUsd: 0,
        finishReason: "error",
        error: "invalida",
        promptId: null,
      },
      { database: connection.db },
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "INVALID_LLM_CALL", message: "La traza de IA no es valida." },
    });
  });
});
