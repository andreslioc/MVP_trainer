import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import { advisors, pretrainingActivity, products } from "../../src/db/schema.ts";
import { type AdvisorRole, hasRole } from "../../src/lib/roles.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import {
  listTodayPretrainingTime,
  recordPretrainingTime,
} from "../../src/server/pretraining-time.ts";
import { validProductInput } from "../fixtures/product.ts";

const connection = openDirectDatabase("test");
const advisorId = randomUUID();
const productId = randomUUID();
const draftProductId = randomUUID();

const asAdvisor = async (role: AdvisorRole) =>
  hasRole("asesor", role)
    ? { ok: true as const, data: { id: advisorId, role: "asesor" as const } }
    : { ok: false as const, error: { code: "FORBIDDEN", message: "Sin permiso." } };

beforeAll(async () => {
  await connection.db.insert(advisors).values({
    id: advisorId,
    email: `pretraining-time-${advisorId}@example.test`,
    displayName: "Asesora que estudia",
    role: "asesor",
  });
  const base = productInputSchema.parse(validProductInput());
  await connection.db.insert(products).values([
    { ...base, id: productId, name: `Ficha verificada ${productId}`, verifiedAt: new Date() },
    { ...base, id: draftProductId, name: `Ficha borrador ${draftProductId}`, verifiedAt: null },
  ]);
});

afterAll(async () => {
  await connection.db
    .delete(pretrainingActivity)
    .where(eq(pretrainingActivity.advisorId, advisorId));
  await connection.db.delete(products).where(eq(products.id, productId));
  await connection.db.delete(products).where(eq(products.id, draftProductId));
  await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
  await connection.close();
});

describe("recordPretrainingTime", () => {
  it("acumula pulsos de la misma ficha en el mismo dia", async () => {
    const now = () => new Date("2026-09-17T15:00:00Z");
    const first = await recordPretrainingTime(
      { productId, seconds: 20 },
      { authorize: asAdvisor, database: connection.db, now },
    );
    const second = await recordPretrainingTime(
      { productId, seconds: 35 },
      { authorize: asAdvisor, database: connection.db, now },
    );

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.studyDate).toBe("2026-09-17");
    expect(second.data.activeSeconds).toBe(55);
  });

  it("abre otro acumulado al cambiar el dia de Bogota", async () => {
    const result = await recordPretrainingTime(
      { productId, seconds: 12 },
      {
        authorize: asAdvisor,
        database: connection.db,
        // 00:30 UTC todavia pertenece al 17 de septiembre en Colombia.
        now: () => new Date("2026-09-18T00:30:00Z"),
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.studyDate).toBe("2026-09-17");

    const nextDay = await recordPretrainingTime(
      { productId, seconds: 10 },
      {
        authorize: asAdvisor,
        database: connection.db,
        now: () => new Date("2026-09-18T05:30:00Z"),
      },
    );
    expect(nextDay.ok).toBe(true);
    if (!nextDay.ok) return;
    expect(nextDay.data.studyDate).toBe("2026-09-18");
    expect(nextDay.data.activeSeconds).toBe(10);
  });

  it("rechaza pulsos inflados y fichas sin verificar", async () => {
    const inflated = await recordPretrainingTime(
      { productId, seconds: 91 },
      { authorize: asAdvisor, database: connection.db },
    );
    const draft = await recordPretrainingTime(
      { productId: draftProductId, seconds: 10 },
      { authorize: asAdvisor, database: connection.db },
    );

    expect(inflated.ok).toBe(false);
    expect(draft.ok).toBe(false);
    if (!inflated.ok) expect(inflated.error.code).toBe("VALIDATION");
    if (!draft.ok) expect(draft.error.code).toBe("NOT_FOUND");

    const rows = await connection.db
      .select()
      .from(pretrainingActivity)
      .where(
        and(
          eq(pretrainingActivity.advisorId, advisorId),
          eq(pretrainingActivity.productId, draftProductId),
        ),
      );
    expect(rows).toHaveLength(0);
  });

  it("lista solamente el acumulado del dia pedido", async () => {
    const result = await listTodayPretrainingTime({
      authorize: asAdvisor,
      database: connection.db,
      now: () => new Date("2026-09-18T15:00:00Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([expect.objectContaining({ productId, activeSeconds: 10 })]);
  });
});
