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
import { validProductInput } from "../fixtures/product.ts";

const connection = openDirectDatabase("test");
const advisorId = randomUUID();
const productId = randomUUID();
const sessionId = randomUUID();
const suffix = randomUUID().slice(0, 8);
const ctaRuleKey = `memory_cta_${suffix}`;
const ctaText = `CTA memoria ${suffix}`;
const promptVersion = Number.parseInt(randomUUID().slice(0, 7), 16);
let originalPromo: typeof commercialRules.$inferSelect | undefined;
const authorize = async () => ({
  ok: true as const,
  data: { id: advisorId, role: "asesor" as const },
});

function parseOrchestration(input: { messages: Array<{ content: string }> }) {
  const line = input.messages[0]?.content
    .split("\n")
    .find((candidate) => candidate.startsWith("ORQUESTACION COMERCIAL: "));
  return JSON.parse(line?.slice("ORQUESTACION COMERCIAL: ".length) ?? "{}") as {
    cta: { text: string; ruleKey: string } | null;
    incentive: { ruleKey: string; value: Record<string, unknown> } | null;
    ruleApplied: string | null;
  };
}

function composition(orchestration: ReturnType<typeof parseOrchestration>): CopilotComposition {
  return {
    intent: "compra",
    // El texto menciona el incentivo: una respuesta que dice aplicar una regla
    // sin nombrarla ya no cuenta como que la aplico.
    express:
      "La ficha contiene información verificada para orientar tu compra, y tenemos envío gratis en compras desde $120.000.",
    estandar:
      "La ficha contiene información verificada para orientar tu compra, y tenemos envío gratis en compras desde $120.000.",
    profunda:
      "La ficha contiene información verificada para orientar tu compra, y tenemos envío gratis en compras desde $120.000.",
    confidence: "alto",
    cta_used: orchestration.cta?.text ?? null,
    rule_applied: orchestration.ruleApplied,
  };
}

beforeAll(async () => {
  [originalPromo] = await connection.db
    .select()
    .from(commercialRules)
    .where(eq(commercialRules.key, "promo_live"));
  await connection.db
    .insert(commercialRules)
    .values({ key: "promo_live", value: { message: "No debe mencionarse" }, active: false })
    .onConflictDoUpdate({
      target: commercialRules.key,
      set: { value: { message: "No debe mencionarse" }, active: false },
    });
  await connection.db.insert(commercialRules).values({
    key: ctaRuleKey,
    value: { cta: ctaText },
    active: true,
  });
  await connection.db.insert(advisors).values({
    id: advisorId,
    email: `${advisorId}@example.test`,
    displayName: "Memory Owner",
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
      body: "Clasificador memoria",
      active: true,
    },
    {
      name: "copilot_compose_express",
      version: promptVersion,
      body: "Compositor memoria",
      active: true,
    },
  ]);
});

afterAll(async () => {
  await connection.db.delete(liveSessions).where(eq(liveSessions.id, sessionId));
  await connection.db.delete(products).where(eq(products.id, productId));
  await connection.db.delete(commercialRules).where(eq(commercialRules.key, ctaRuleKey));
  if (originalPromo) {
    await connection.db
      .update(commercialRules)
      .set({
        value: originalPromo.value,
        active: originalPromo.active,
        updatedAt: originalPromo.updatedAt,
      })
      .where(eq(commercialRules.key, "promo_live"));
  } else {
    await connection.db.delete(commercialRules).where(eq(commercialRules.key, "promo_live"));
  }
  for (const name of ["copilot_classify", "copilot_compose_express"]) {
    await connection.db
      .delete(prompts)
      .where(and(eq(prompts.name, name), eq(prompts.version, promptVersion)));
  }
  await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
  await connection.close();
});

const request = {
  liveSessionId: sessionId,
  productId,
  customerQuestion: "¿Cómo puedo comprar este producto?",
  lengthVariant: "express" as const,
  objective: "guiar la compra",
  tone: "cercano",
};

describe("Copilot commercial memory", () => {
  it("updates CTA and promotion memory only with the successful exchange", async () => {
    let selected: ReturnType<typeof parseOrchestration> | undefined;
    const result = await composeCopilotAnswer(request, {
      authorize,
      database: connection.db,
      classify: async () => ({
        ok: true,
        data: { value: { intent: "compra" }, repaired: false },
      }),
      stream: async (input) => {
        selected = parseOrchestration(input);
        const value = composition(selected);
        await input.onDelta(JSON.stringify(value));
        return {
          ok: true,
          data: {
            value,
            model: "fake",
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
            },
            costUsd: 0,
            timeToFirstTokenMs: 10,
            time_to_first_token_ms: 10,
          },
        };
      },
    });

    expect(result.ok).toBe(true);
    expect(selected).toBeDefined();
    const [session] = await connection.db
      .select()
      .from(liveSessions)
      .where(eq(liveSessions.id, sessionId));
    expect(session?.ctasUsed.at(-1)?.cta).toBe(selected?.cta?.text);
    if (selected?.incentive) {
      expect(session?.promosMentioned.at(-1)?.rule_key).toBe(selected.incentive.ruleKey);
    }
    expect(session?.promosMentioned.some((entry) => entry.rule_key === "promo_live")).toBe(false);
  });

  it("leaves both memories and exchanges intact when composition fails", async () => {
    const [beforeSession] = await connection.db
      .select()
      .from(liveSessions)
      .where(eq(liveSessions.id, sessionId));
    const beforeExchanges = await connection.db
      .select({ id: copilotExchanges.id })
      .from(copilotExchanges)
      .where(eq(copilotExchanges.liveSessionId, sessionId));
    const failedStream = vi.fn(async () => ({
      ok: false as const,
      error: { code: "AI_PROVIDER_ERROR" as const, message: "Fallo controlado" },
    }));

    const result = await composeCopilotAnswer(request, {
      authorize,
      database: connection.db,
      classify: async () => ({
        ok: true,
        data: { value: { intent: "compra" }, repaired: false },
      }),
      stream: failedStream,
    });
    const [afterSession] = await connection.db
      .select()
      .from(liveSessions)
      .where(eq(liveSessions.id, sessionId));
    const afterExchanges = await connection.db
      .select({ id: copilotExchanges.id })
      .from(copilotExchanges)
      .where(eq(copilotExchanges.liveSessionId, sessionId));

    expect(result).toMatchObject({ ok: false, error: { code: "COPILOT_FAILED" } });
    expect(failedStream).toHaveBeenCalledOnce();
    expect(afterSession?.ctasUsed).toEqual(beforeSession?.ctasUsed);
    expect(afterSession?.promosMentioned).toEqual(beforeSession?.promosMentioned);
    expect(afterExchanges).toEqual(beforeExchanges);
  });
});
