import { describe, expect, it } from "vitest";

import { selfLockoutError } from "../../src/lib/validation/advisor.ts";
import { listAdvisors, updateAdvisorRole, updateAdvisorStatus } from "../../src/server/advisors.ts";

const admin = { id: "11111111-1111-4111-8111-111111111111", role: "admin" as const };
const advisor = { id: "22222222-2222-4222-8222-222222222222", role: "asesor" as const };

const authorizeAsAdmin = async () => ({ ok: true as const, data: admin });
const authorizeAsAdvisor = async () => ({
  ok: false as const,
  error: { code: "FORBIDDEN", message: "No tienes permiso para esta acción." },
});

function readerReturning(rows: unknown[]) {
  return {
    select: () => ({ from: () => ({ orderBy: async () => rows }) }),
  } as never;
}

function writerCapturing(captured: { values?: unknown }, returned: unknown[]) {
  return {
    update: () => ({
      set: (values: unknown) => {
        captured.values = values;
        return { where: () => ({ returning: async () => returned }) };
      },
    }),
  } as never;
}

describe("directorio de cuentas", () => {
  it("le niega la lista a una asesora", async () => {
    const result = await listAdvisors({
      authorize: authorizeAsAdvisor,
      database: readerReturning([]),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FORBIDDEN");
  });

  it("marca cual de las cuentas es la de quien mira", async () => {
    const result = await listAdvisors({
      authorize: authorizeAsAdmin,
      database: readerReturning([
        { id: admin.id, displayName: "Admin", role: "admin", status: "activa" },
        { id: advisor.id, displayName: "Asesora", role: "asesor", status: "activa" },
      ]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((row) => row.isSelf)).toEqual([true, false]);
  });
});

describe("cambio de rol y de estado", () => {
  it("promueve a una asesora a administradora", async () => {
    const captured: { values?: unknown } = {};
    const result = await updateAdvisorRole(
      { advisorId: advisor.id, role: "admin" },
      {
        authorize: authorizeAsAdmin,
        database: writerCapturing(captured, [{ id: advisor.id, role: "admin" }]),
      },
    );

    expect(result.ok).toBe(true);
    expect(captured.values).toEqual({ role: "admin" });
  });

  it("no deja que una admin se quite el rol a si misma", async () => {
    const captured: { values?: unknown } = {};
    const result = await updateAdvisorRole(
      { advisorId: admin.id, role: "asesor" },
      { authorize: authorizeAsAdmin, database: writerCapturing(captured, []) },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SELF_LOCKOUT");
    expect(captured.values).toBeUndefined();
  });

  it("no deja que una admin desactive su propia cuenta", async () => {
    const captured: { values?: unknown } = {};
    const result = await updateAdvisorStatus(
      { advisorId: admin.id, status: "inactiva" },
      { authorize: authorizeAsAdmin, database: writerCapturing(captured, []) },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SELF_LOCKOUT");
    expect(captured.values).toBeUndefined();
  });

  it("responde que la cuenta no existe cuando el update no toca ninguna fila", async () => {
    const result = await updateAdvisorStatus(
      { advisorId: advisor.id, status: "inactiva" },
      { authorize: authorizeAsAdmin, database: writerCapturing({}, []) },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ADVISOR_NOT_FOUND");
  });

  it("rechaza un id que no es un uuid antes de tocar la base", async () => {
    const result = await updateAdvisorRole(
      { advisorId: "no-es-uuid", role: "admin" },
      { authorize: authorizeAsAdmin, database: writerCapturing({}, []) },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_ADVISOR");
  });
});

describe("selfLockoutError", () => {
  it("solo bloquea cuando el actor y el objetivo son la misma cuenta", () => {
    expect(selfLockoutError(admin.id, advisor.id, "rol")).toBeUndefined();
    expect(selfLockoutError(admin.id, admin.id, "rol")?.field).toBe("rol");
  });
});
