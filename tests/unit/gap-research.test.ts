import { describe, expect, it } from "vitest";

import type { products } from "../../src/db/schema.ts";
import type { GapVerification } from "../../src/lib/ai/schemas.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import { researchProductGap } from "../../src/server/gap-research.ts";
import { validProductInput } from "../fixtures/product.ts";

const PRODUCT_ID = "00000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-28T10:00:00.000Z");

function product(
  overrides: Partial<typeof products.$inferSelect> = {},
): typeof products.$inferSelect {
  return {
    id: PRODUCT_ID,
    ...productInputSchema.parse(
      validProductInput({
        verificationGaps: ["Registro sanitario INVIMA en Colombia."],
      }),
    ),
    sku: null,
    imageUrl: null,
    verifiedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/**
 * Base falsa minima: devuelve la ficha y captura lo que se escribe.
 *
 * Sin red y sin Postgres — un gate que necesita credenciales de un tercero no
 * es un gate.
 */
function fakeDatabase(row: typeof products.$inferSelect) {
  const written: Array<Record<string, unknown>> = [];
  const database = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [row],
          orderBy: () => ({ limit: async () => [{ id: "prompt-1" }] }),
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({ returning: async () => [{ ...row, ...values }] }),
      }),
    }),
    // biome-ignore lint/suspicious/noExplicitAny: doble de prueba, no el cliente real
  } as any;
  return { database, written };
}

const authorizeAdmin = async () => ({
  ok: true as const,
  data: { id: "advisor-1", role: "admin" as const },
});

function searchReturning(text: string, citations: Array<{ url: string; title: string }> = []) {
  return async () => ({
    ok: true as const,
    data: {
      text,
      citations,
      refusal: false,
      refusalCategory: null,
      finishReason: "stop",
      usage: { inputTokens: 0, outputTokens: 0 },
      // biome-ignore lint/suspicious/noExplicitAny: el doble solo necesita estos campos
    } as any,
  });
}

function structureReturning(value: GapVerification) {
  return async () => ({ ok: true as const, data: { value, repaired: false } });
}

describe("investigar un dato pendiente", () => {
  it("escribe el hallazgo dentro del hueco, fechado y con su desenlace", async () => {
    const { database } = fakeDatabase(product());
    const result = await researchProductGap(PRODUCT_ID, 0, {
      authorize: authorizeAdmin,
      database,
      now: () => NOW,
      search: searchReturning("No aparece en el registro."),
      structure: structureReturning({
        outcome: "no_publicado",
        finding: "No aparece ninguna referencia de esta marca en el registro público.",
        searched_in: ["INVIMA datos abiertos"],
        sources: [],
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.outcome).toBe("no_publicado");
    expect(result.data.gap).toContain("BUSCADO 2026-08-28");
    expect(result.data.gap).toContain("no_publicado");
    expect(result.data.gap).toContain("INVIMA datos abiertos");
  });

  it("no duplica el sello cuando el mismo hueco se investiga dos veces", async () => {
    const yaBuscado = "Registro INVIMA. | BUSCADO 2026-08-01 (no_publicado): no estaba.";
    const { database } = fakeDatabase(product({ verificationGaps: [yaBuscado] }));
    const result = await researchProductGap(PRODUCT_ID, 0, {
      authorize: authorizeAdmin,
      database,
      now: () => NOW,
      search: searchReturning("Sigue sin aparecer."),
      structure: structureReturning({
        outcome: "no_publicado",
        finding: "Sigue sin aparecer.",
        searched_in: [],
        sources: [],
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.gap.match(/BUSCADO/g)).toHaveLength(1);
    expect(result.data.gap).toContain("2026-08-28");
  });

  it("devuelve el error del proveedor sin tocar la ficha", async () => {
    const { database } = fakeDatabase(product());
    const result = await researchProductGap(PRODUCT_ID, 0, {
      authorize: authorizeAdmin,
      database,
      now: () => NOW,
      search: async () => ({
        ok: false as const,
        error: { code: "AI_PROVIDER_ERROR", message: "El proveedor de IA no respondio." },
      }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("AI_PROVIDER_ERROR");
  });

  it("rechaza un índice de hueco que no existe", async () => {
    const { database } = fakeDatabase(product());
    const result = await researchProductGap(PRODUCT_ID, 7, {
      authorize: authorizeAdmin,
      database,
      now: () => NOW,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("GAP_NOT_FOUND");
  });

  it("solo lo puede correr una administradora", async () => {
    const { database } = fakeDatabase(product());
    const result = await researchProductGap(PRODUCT_ID, 0, {
      authorize: async () => ({
        ok: false as const,
        error: { code: "FORBIDDEN", message: "No tienes permiso para esta acción." },
      }),
      database,
      now: () => NOW,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FORBIDDEN");
  });
});
