import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import { products } from "../../src/db/schema.ts";
import {
  createProduct,
  deleteProduct,
  listProducts,
  updateProduct,
} from "../../src/server/products.ts";
import { validProductInput } from "../fixtures/product.ts";

const connection = openDirectDatabase("test");
const createdIds = new Set<string>();
const authorizeAdmin = async () => ({ ok: true as const, data: { role: "admin" as const } });
const authorizeAdvisor = async () => ({ ok: true as const, data: { role: "asesor" as const } });
const denyAdvisor = async () => ({
  ok: false as const,
  error: { code: "FORBIDDEN", message: "No tienes permiso para esta acción." },
});

afterAll(async () => {
  for (const id of createdIds) {
    await connection.db.delete(products).where(eq(products.id, id));
  }
  await connection.close();
});

describe("Knowledge Hub products", () => {
  it("persists every field, updates it and deletes it for an admin", async () => {
    const input = validProductInput({ name: "CRUD completo" });
    const created = await createProduct(input, {
      authorize: authorizeAdmin,
      database: connection.db,
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdIds.add(created.data.id);
    expect(created.data).toMatchObject(input);

    const updated = await updateProduct(
      created.data.id,
      validProductInput({ name: "CRUD actualizado", verifiedAt: new Date("2026-08-18T12:00:00Z") }),
      { authorize: authorizeAdmin, database: connection.db },
    );
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.data.name).toBe("CRUD actualizado");
    expect(updated.data.verifiedAt?.toISOString()).toBe("2026-08-18T12:00:00.000Z");

    const deleted = await deleteProduct(created.data.id, {
      authorize: authorizeAdmin,
      database: connection.db,
    });
    expect(deleted).toEqual({ ok: true, data: { id: created.data.id } });
    createdIds.delete(created.data.id);
  });

  it("returns unverified products before verified products to any authenticated role", async () => {
    const unverified = await createProduct(
      validProductInput({ name: "A unverified", verifiedAt: null }),
      { authorize: authorizeAdmin, database: connection.db },
    );
    const verified = await createProduct(
      validProductInput({ name: "B verified", verifiedAt: new Date("2026-08-18T12:00:00Z") }),
      { authorize: authorizeAdmin, database: connection.db },
    );
    expect(unverified.ok && verified.ok).toBe(true);
    if (!unverified.ok || !verified.ok) return;
    createdIds.add(unverified.data.id);
    createdIds.add(verified.data.id);

    const result = await listProducts({ authorize: authorizeAdvisor, database: connection.db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const unverifiedIndex = result.data.findIndex((product) => product.id === unverified.data.id);
    const verifiedIndex = result.data.findIndex((product) => product.id === verified.data.id);
    expect(unverifiedIndex).toBeGreaterThanOrEqual(0);
    expect(verifiedIndex).toBeGreaterThan(unverifiedIndex);
  });

  it("returns FORBIDDEN and writes zero rows when an advisor calls the writer", async () => {
    const name = "Advisor must not write";
    const result = await createProduct(validProductInput({ name }), {
      authorize: denyAdvisor,
      database: connection.db,
    });
    const rows = await connection.db.select().from(products).where(eq(products.name, name));

    expect(result).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "No tienes permiso para esta acción." },
    });
    expect(rows).toHaveLength(0);
  });
});
