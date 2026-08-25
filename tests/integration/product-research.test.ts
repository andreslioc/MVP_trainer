import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import { advisors, products } from "../../src/db/schema.ts";
import type { ResearchedProduct } from "../../src/lib/ai/schemas.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import { researchProduct } from "../../src/server/product-research.ts";
import { validProductInput } from "../fixtures/product.ts";

const connection = openDirectDatabase("test");
const adminId = randomUUID();
const productId = randomUUID();
const authorizeAdmin = async () => ({
  ok: true as const,
  data: { id: adminId, role: "admin" as const },
});

const citations = [{ url: "https://ejemplo.test/etiqueta", title: "Etiqueta oficial" }];

function researched(): ResearchedProduct {
  return {
    name: "Magnesio investigado",
    brand: "Marca Investigada",
    presentation: "Frasco 120 cápsulas",
    format: "Cápsulas",
    description: "Suplemento de magnesio en cápsulas.",
    usage_mode: "Una cápsula al día con comida.",
    active_ingredients: [{ name: "Glicinato de magnesio", declared_amount: "500 mg" }],
    benefits: [
      { claim: "Aporta magnesio", science_note: "Declarado en la etiqueta." },
      { claim: "Ciento veinte cápsulas", science_note: "Cantidad impresa en el frasco." },
      { claim: "Formato en cápsulas", science_note: "Formato declarado por el fabricante." },
    ],
    faqs: [{ question: "¿Cuántas trae?", answer: "Ciento veinte cápsulas." }],
    objections: [{ objection: "Es caro", response: "El frasco rinde 120 porciones." }],
    differentiators: [{ claim: "120 cápsulas", evidence: "Etiqueta del frasco." }],
    contraindications: ["Embarazo", "Lactancia"],
    precautions: "Consulta a tu médico en embarazo, lactancia o si tomas medicamentos.",
    claims_allowed: ["Es un suplemento de magnesio en cápsulas."],
    claims_caution: ["El aporte por porción depende de la etiqueta del lote."],
    unconfirmed: ["Registro sanitario"],
  };
}

function searchResult(sources = citations) {
  return {
    ok: true as const,
    data: {
      id: "res_1",
      text: "La etiqueta declara glicinato de magnesio 500 mg y 120 cápsulas.",
      model: "modelo-de-prueba",
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 },
      costUsd: 0,
      citations: sources,
    },
  };
}

beforeAll(async () => {
  await connection.db.insert(advisors).values({
    id: adminId,
    email: `research-${adminId}@example.test`,
    displayName: "Research Admin",
    role: "admin",
  });
  await connection.db.insert(products).values({
    id: productId,
    ...productInputSchema.parse(
      validProductInput({ verifiedAt: new Date("2026-08-18T12:00:00Z") }),
    ),
  });
});

afterAll(async () => {
  await connection.db.delete(products).where(eq(products.id, productId));
  await connection.db.delete(advisors).where(eq(advisors.id, adminId));
  await connection.close();
});

describe("investigacion de ficha con busqueda web", () => {
  it("no escribe nada cuando la busqueda no devuelve fuentes", async () => {
    const before = await connection.db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    const result = await researchProduct(productId, {
      authorize: authorizeAdmin,
      database: connection.db,
      search: async () => searchResult([]),
      structure: async () => {
        throw new Error("No debe estructurarse sin fuentes.");
      },
    });

    const after = await connection.db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    expect(result).toMatchObject({ ok: false, error: { code: "NO_SOURCES" } });
    expect(after).toEqual(before);
  });

  it("reemplaza el contenido y devuelve la ficha a por verificar", async () => {
    const result = await researchProduct(productId, {
      authorize: authorizeAdmin,
      database: connection.db,
      search: async () => searchResult(),
      structure: async () => ({
        ok: true as const,
        data: { value: researched(), repaired: false },
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.sources).toBe(1);
    expect(result.data.product.name).toBe("Magnesio investigado");
    // Verificada antes, por verificar despues: el contenido que alguien aprobo
    // ya no es el que esta guardado.
    expect(result.data.product.verifiedAt).toBeNull();
    expect(result.data.product.sources).toEqual([
      {
        label: "Etiqueta oficial",
        url: "https://ejemplo.test/etiqueta",
        note: "Abierta durante la investigacion automatica; pendiente de revision humana.",
      },
    ]);
    // El precio no lo decide una busqueda web.
    expect(result.data.product.priceCop).toBe(
      productInputSchema.parse(validProductInput()).priceCop ?? null,
    );
  });

  it("rechaza a quien no es admin", async () => {
    const result = await researchProduct(productId, {
      authorize: async () => ({
        ok: false as const,
        error: { code: "FORBIDDEN", message: "Solo una administradora." },
      }),
      database: connection.db,
      search: async () => {
        throw new Error("No debe buscar sin permiso.");
      },
    });

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
});
