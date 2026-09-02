import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import { advisors, trainingSessions } from "../../src/db/schema.ts";
import type { AdvisorRole } from "../../src/lib/roles.ts";
import { deleteAdvisor } from "../../src/server/advisor-delete.ts";

const connection = openDirectDatabase("test");
const adminId = randomUUID();

const asAdmin = async (role: AdvisorRole) =>
  role === "admin" || role === "supervisor" || role === "asesor"
    ? { ok: true as const, data: { id: adminId, role: "admin" as const } }
    : { ok: false as const, error: { code: "FORBIDDEN", message: "Sin permiso." } };
const asAdvisor = async (role: AdvisorRole) =>
  role === "asesor"
    ? { ok: true as const, data: { id: randomUUID(), role: "asesor" as const } }
    : { ok: false as const, error: { code: "FORBIDDEN", message: "Sin permiso." } };

/** Doble del sistema de acceso: registra a quien se le pidio borrar. */
function fakeAuth() {
  const borrados: string[] = [];
  return {
    borrados,
    admin: {
      deleteUser: async (id: string) => {
        borrados.push(id);
        return { error: null };
      },
    },
  };
}

let targetId = "";
const email = () => `borrar-${targetId}@example.test`;

beforeEach(async () => {
  targetId = randomUUID();
  await connection.db
    .insert(advisors)
    .values({ id: targetId, email: email(), displayName: "Cuenta por borrar", role: "asesor" });
});

afterAll(async () => {
  await connection.db.delete(advisors).where(eq(advisors.id, adminId));
  await connection.close();
});

describe("borrar una cuenta", () => {
  it("solo la borra un administrador", async () => {
    const result = await deleteAdvisor(
      { advisorId: targetId, confirmEmail: email() },
      { authorize: asAdvisor, database: connection.db },
    );
    expect(result.ok).toBe(false);
    await connection.db.delete(advisors).where(eq(advisors.id, targetId));
  });

  it("exige el correo exacto de esa cuenta", async () => {
    const result = await deleteAdvisor(
      { advisorId: targetId, confirmEmail: "otra@example.test" },
      { authorize: asAdmin, database: connection.db, adminAuth: fakeAuth().admin },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFIRMATION_MISMATCH");
    // No la borro: la cuenta sigue ahi.
    const [sigue] = await connection.db.select().from(advisors).where(eq(advisors.id, targetId));
    expect(sigue).toBeDefined();
    await connection.db.delete(advisors).where(eq(advisors.id, targetId));
  });

  it("acepta el correo con otra caja y con espacios", async () => {
    const auth = fakeAuth();
    const result = await deleteAdvisor(
      { advisorId: targetId, confirmEmail: `  ${email().toUpperCase()}  ` },
      { authorize: asAdmin, database: connection.db, adminAuth: auth.admin },
    );
    expect(result.ok).toBe(true);
    expect(auth.borrados).toEqual([targetId]);
  });

  it("no deja borrar la cuenta propia", async () => {
    await connection.db
      .insert(advisors)
      .values({
        id: adminId,
        email: `admin-${adminId}@example.test`,
        displayName: "Admin",
        role: "admin",
      })
      .onConflictDoNothing();
    const result = await deleteAdvisor(
      { advisorId: adminId, confirmEmail: `admin-${adminId}@example.test` },
      { authorize: asAdmin, database: connection.db, adminAuth: fakeAuth().admin },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SELF_LOCKOUT");
    await connection.db.delete(advisors).where(eq(advisors.id, targetId));
  });

  it("se lleva en cascada las practicas de esa persona", async () => {
    await connection.db.insert(trainingSessions).values({ advisorId: targetId, category: "Bebes" });
    const antes = await connection.db
      .select()
      .from(trainingSessions)
      .where(eq(trainingSessions.advisorId, targetId));
    expect(antes.length).toBe(1);

    const result = await deleteAdvisor(
      { advisorId: targetId, confirmEmail: email() },
      { authorize: asAdmin, database: connection.db, adminAuth: fakeAuth().admin },
    );
    expect(result.ok).toBe(true);

    const despues = await connection.db
      .select()
      .from(trainingSessions)
      .where(eq(trainingSessions.advisorId, targetId));
    expect(despues.length).toBe(0);
  });

  it("avisa cuando la fila se fue y el acceso no", async () => {
    const roto = {
      deleteUser: async () => ({ error: { message: "boom" } }),
    };
    const result = await deleteAdvisor(
      { advisorId: targetId, confirmEmail: email() },
      { authorize: asAdmin, database: connection.db, adminAuth: roto },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("AUTH_DELETE_FAILED");
    // La fila si se borro: la persona no entra a ningun modulo.
    const [sigue] = await connection.db.select().from(advisors).where(eq(advisors.id, targetId));
    expect(sigue).toBeUndefined();
  });
});
