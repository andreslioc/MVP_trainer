import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import {
  advisors,
  commercialRules,
  copilotExchanges,
  liveSessions,
  products,
  prompts,
} from "../../src/db/schema.ts";
import type { CopilotComposition } from "../../src/lib/ai/schemas.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import { composeCopilotAnswer } from "../../src/server/copilot/compose.ts";
import {
  endLiveSession,
  getCopilotSetup,
  startLiveSession,
} from "../../src/server/copilot/session.ts";
import { validProductInput } from "../fixtures/product.ts";

const connection = openDirectDatabase("test");
const advisorId = randomUUID();
const otherAdvisorId = randomUUID();
const productId = randomUUID();
const suffix = randomUUID().slice(0, 8);
const activeRuleKey = `copilot_cta_${suffix}`;
const inactiveRuleKey = `copilot_inactive_${suffix}`;
const cta = `Escríbenos por el canal ${suffix}`;
const promptVersion = Number.parseInt(randomUUID().slice(0, 7), 16);
let sessionId = "";
const authorize = (id: string) => async () => ({
  ok: true as const,
  data: { id, role: "asesor" as const },
});

function composition(): CopilotComposition {
  return {
    intent: "informacion",
    express:
      "Contiene magnesio verificado en la ficha. Revisa la etiqueta para conocer la porción.",
    estandar:
      "Contiene magnesio verificado en la ficha y viene en cápsulas. Revisa la etiqueta para conocer la porción y confirmar cómo integrarlo a tu rutina.",
    profunda:
      "La ficha registra magnesio y una presentación en cápsulas. Su beneficio permitido es complementar la ingesta. Revisa siempre la etiqueta para confirmar la porción y consulta a un profesional si usas medicamentos.",
    confidence: "alto",
    cta_used: cta,
    rule_applied: activeRuleKey,
  };
}

beforeAll(async () => {
  await connection.db.insert(advisors).values([
    { id: advisorId, email: `${advisorId}@example.test`, displayName: "Copilot Owner" },
    { id: otherAdvisorId, email: `${otherAdvisorId}@example.test`, displayName: "Copilot Other" },
  ]);
  await connection.db.insert(products).values({
    id: productId,
    ...productInputSchema.parse(
      validProductInput({ verifiedAt: new Date("2026-08-18T12:00:00Z") }),
    ),
  });
  await connection.db.insert(commercialRules).values([
    { key: activeRuleKey, value: { cta }, active: true },
    { key: inactiveRuleKey, value: { message: "No debe entrar" }, active: false },
  ]);
  await connection.db.insert(prompts).values([
    {
      name: "copilot_classify",
      version: promptVersion,
      body: "Clasificador de integración",
      active: true,
    },
    {
      name: "copilot_compose_express",
      version: promptVersion,
      body: "Compositor de integración",
      active: true,
    },
  ]);
});

afterAll(async () => {
  await connection.db.delete(liveSessions).where(eq(liveSessions.advisorId, advisorId));
  await connection.db.delete(products).where(eq(products.id, productId));
  await connection.db.delete(commercialRules).where(eq(commercialRules.key, activeRuleKey));
  await connection.db.delete(commercialRules).where(eq(commercialRules.key, inactiveRuleKey));
  await connection.db
    .delete(prompts)
    .where(and(eq(prompts.version, promptVersion), eq(prompts.name, "copilot_classify")));
  await connection.db
    .delete(prompts)
    .where(and(eq(prompts.version, promptVersion), eq(prompts.name, "copilot_compose_express")));
  await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
  await connection.db.delete(advisors).where(eq(advisors.id, otherAdvisorId));
  await connection.close();
});

describe("Copilot session and exchange", () => {
  it("starts one private live session and returns only active setup rules", async () => {
    const first = await startLiveSession({
      authorize: authorize(advisorId),
      database: connection.db,
    });
    const second = await startLiveSession({
      authorize: authorize(advisorId),
      database: connection.db,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    sessionId = first.data.id;
    expect(second.data.id).toBe(sessionId);
    expect(first.data.advisorId).toBe(advisorId);

    const setup = await getCopilotSetup({
      authorize: authorize(advisorId),
      database: connection.db,
    });
    expect(setup.ok).toBe(true);
    if (!setup.ok) return;
    expect(setup.data.activeRules.some((rule) => rule.key === activeRuleKey)).toBe(true);
    expect(setup.data.activeRules.some((rule) => rule.key === inactiveRuleKey)).toBe(false);
  });

  it("classifies, streams and persists an attributed exchange", async () => {
    const chunks: string[] = [];
    let streamedSystem = "";
    let selectedCta: string | null = null;
    let selectedRule: string | null = null;
    const result = await composeCopilotAnswer(
      {
        liveSessionId: sessionId,
        productId,
        customerQuestion: "¿Qué contiene este producto?",
        lengthVariant: "express",
        objective: "informar con claridad",
        tone: "cercano",
      },
      {
        authorize: authorize(advisorId),
        database: connection.db,
        classify: async () => ({
          ok: true,
          data: { value: { intent: "informacion" }, repaired: false },
        }),
        stream: async (input) => {
          streamedSystem = input.system;
          const orchestrationLine = input.messages[0]?.content
            .split("\n")
            .find((line) => line.startsWith("ORQUESTACION COMERCIAL: "));
          const orchestration = JSON.parse(
            orchestrationLine?.slice("ORQUESTACION COMERCIAL: ".length) ?? "{}",
          ) as { cta?: { text: string } | null; ruleApplied?: string | null };
          selectedCta = orchestration.cta?.text ?? null;
          selectedRule = orchestration.ruleApplied ?? null;
          const generated = {
            ...composition(),
            cta_used: selectedCta,
            rule_applied: selectedRule,
          };
          await input.onDelta(JSON.stringify(generated));
          return {
            ok: true,
            data: {
              value: generated,
              model: "fake",
              usage: {
                inputTokens: 1,
                outputTokens: 1,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
              },
              costUsd: 0,
              timeToFirstTokenMs: 20,
              time_to_first_token_ms: 20,
            },
          };
        },
        onChunk: (chunk) => {
          chunks.push(chunk);
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.timeToFirstTokenMs).toBeLessThan(250);
    expect(result.data.time_to_first_token_ms).toBeLessThan(250);
    expect(chunks.join("")).toBe(composition().express);
    expect(streamedSystem).toContain(activeRuleKey);
    expect(streamedSystem).not.toContain(inactiveRuleKey);
    expect(result.data.exchange).toMatchObject({
      liveSessionId: sessionId,
      productId,
      customerQuestion: "¿Qué contiene este producto?",
      intent: "informacion",
      lengthVariant: "express",
      confidence: "alto",
      ctaUsed: selectedCta,
      ruleApplied: selectedRule,
      alerts: [],
    });
    expect(result.data.exchange.durationEstimateS).toBeGreaterThan(0);
  });

  it("does not call composition for an absent fact and persists a cautious answer", async () => {
    // La ficha se deja sin precio a proposito: con precio cargado esta pregunta
    // ya no es un dato ausente, y esa es justamente la mejora.
    await connection.db
      .update(products)
      .set({ verifiedAt: null, priceCop: null })
      .where(eq(products.id, productId));
    const stream = vi.fn();
    const result = await composeCopilotAnswer(
      {
        liveSessionId: sessionId,
        productId,
        customerQuestion: "¿Cuál es el precio?",
        lengthVariant: "express",
        objective: "informar con claridad",
        tone: "directo",
      },
      {
        authorize: authorize(advisorId),
        database: connection.db,
        classify: async () => ({
          ok: true,
          data: { value: { intent: "precio" }, repaired: false },
        }),
        stream,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(stream).not.toHaveBeenCalled();
    expect(result.data.exchange.answerText).toContain("no está verificado");
    expect(result.data.exchange.confidence).toBe("revisar");
  });

  it("does not reveal or write into another advisor session", async () => {
    const before = await connection.db
      .select({ id: copilotExchanges.id })
      .from(copilotExchanges)
      .where(eq(copilotExchanges.liveSessionId, sessionId));
    const result = await composeCopilotAnswer(
      {
        liveSessionId: sessionId,
        productId,
        customerQuestion: "¿Qué contiene?",
        lengthVariant: "express",
        objective: "informar",
        tone: "cercano",
      },
      { authorize: authorize(otherAdvisorId), database: connection.db },
    );
    const after = await connection.db
      .select({ id: copilotExchanges.id })
      .from(copilotExchanges)
      .where(eq(copilotExchanges.liveSessionId, sessionId));

    expect(result).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "El live no existe." },
    });
    expect(after).toEqual(before);
  });

  it("ends only the authenticated advisor live", async () => {
    const denied = await endLiveSession(sessionId, {
      authorize: authorize(otherAdvisorId),
      database: connection.db,
    });
    expect(denied).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "El live no existe." },
    });
    const ended = await endLiveSession(sessionId, {
      authorize: authorize(advisorId),
      database: connection.db,
    });
    expect(ended.ok).toBe(true);
    if (ended.ok) expect(ended.data.endedAt).not.toBeNull();
  });
});
