import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import { commercialRules } from "../../src/db/schema.ts";
import {
  getActiveCommercialRules,
  listCommercialRules,
  updateCommercialRule,
} from "../../src/server/commercial-rules.ts";

const connection = openDirectDatabase("test");
const keys = ["envio_gratis", "promo_live"] as const;
const originalRows = new Map<string, typeof commercialRules.$inferSelect>();
const authorizeAdmin = async () => ({ ok: true as const, data: { role: "admin" as const } });
const authorizeAdvisor = async () => ({ ok: true as const, data: { role: "asesor" as const } });
const denyAdvisor = async () => ({
  ok: false as const,
  error: { code: "FORBIDDEN", message: "No tienes permiso para esta acción." },
});

beforeAll(async () => {
  const existing = await connection.db
    .select()
    .from(commercialRules)
    .where(eq(commercialRules.key, keys[0]));
  const existingPromo = await connection.db
    .select()
    .from(commercialRules)
    .where(eq(commercialRules.key, keys[1]));
  for (const row of [...existing, ...existingPromo]) originalRows.set(row.key, row);

  await connection.db
    .insert(commercialRules)
    .values([
      { key: "envio_gratis", value: { threshold_cop: 111111 }, active: true },
      { key: "promo_live", value: { message: "Promoción de prueba" }, active: true },
    ])
    .onConflictDoUpdate({
      target: commercialRules.key,
      set: { updatedAt: new Date() },
    });
});

afterAll(async () => {
  for (const key of keys) {
    const original = originalRows.get(key);
    if (original) {
      await connection.db
        .update(commercialRules)
        .set({ value: original.value, active: original.active, updatedAt: original.updatedAt })
        .where(eq(commercialRules.key, key));
    } else {
      await connection.db.delete(commercialRules).where(eq(commercialRules.key, key));
    }
  }
  await connection.close();
});

describe("Business Brain", () => {
  it("returns an updated shipping threshold on the next read", async () => {
    const result = await updateCommercialRule(
      { key: "envio_gratis", value: { threshold_cop: 135789 }, active: true },
      { authorize: authorizeAdmin, database: connection.db },
    );
    expect(result.ok).toBe(true);

    const nextRead = await listCommercialRules({
      authorize: authorizeAdmin,
      database: connection.db,
    });
    expect(nextRead.ok).toBe(true);
    if (!nextRead.ok) return;
    expect(nextRead.data.find((rule) => rule.key === "envio_gratis")?.value).toEqual({
      threshold_cop: 135789,
    });
  });

  it("excludes inactive live promotions from composition", async () => {
    const update = await updateCommercialRule(
      { key: "promo_live", value: { message: "Promoción de prueba" }, active: false },
      { authorize: authorizeAdmin, database: connection.db },
    );
    expect(update.ok).toBe(true);

    const active = await getActiveCommercialRules({
      authorize: authorizeAdvisor,
      database: connection.db,
    });
    expect(active.ok).toBe(true);
    if (!active.ok) return;
    expect(active.data.some((rule) => rule.key === "promo_live")).toBe(false);
  });

  it("returns FORBIDDEN to an advisor and writes zero rows", async () => {
    const [before] = await connection.db
      .select()
      .from(commercialRules)
      .where(eq(commercialRules.key, "envio_gratis"));
    const result = await updateCommercialRule(
      { key: "envio_gratis", value: { threshold_cop: 999999 }, active: true },
      { authorize: denyAdvisor, database: connection.db },
    );
    const [after] = await connection.db
      .select()
      .from(commercialRules)
      .where(eq(commercialRules.key, "envio_gratis"));

    expect(result).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "No tienes permiso para esta acción." },
    });
    expect(after).toEqual(before);
  });
});
