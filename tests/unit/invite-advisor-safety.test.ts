import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { type AdminAuth, createInvitedAdvisor } from "../../src/server/advisors.ts";

/**
 * Que invitar a una persona no pueda quitarle el acceso a otra.
 *
 * `inviteUserByEmail` sobre un correo que ya existe pero esta SIN confirmar no
 * devuelve error: GoTrue reenvia la invitacion y responde 200 con ese usuario
 * ya existente. El insert chocaba entonces con `advisors_email_unique` y el
 * `deleteUser` de limpieza borraba una cuenta de auth ajena a la operacion.
 * Estas tres pruebas fijan las tres salidas de ese cruce.
 */

/**
 * Las dos consultas que hace el flujo, en orden: primero el correo —antes de
 * invitar— y despues el id, ya dentro del catch. La cola las sirve en ese
 * orden porque son las dos unicas, y afirmarlo asi deja visible cual bloquea
 * que.
 */
function fakeDatabase(selectResults: { id: string }[][], onInsert?: () => never) {
  const pendientes = [...selectResults];
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => pendientes.shift() ?? [],
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: async () => {
          onInsert?.();
          return [{ id: "no-se-usa" }];
        },
      }),
    }),
  } as never;
}

function fakeAdminAuth(userId: string) {
  const llamadas = { invitados: 0, borrados: [] as string[] };
  const auth = {
    inviteUserByEmail: async () => {
      llamadas.invitados += 1;
      return { data: { user: { id: userId } }, error: null };
    },
    deleteUser: async (id: string) => {
      llamadas.borrados.push(id);
      return { error: null };
    },
  } as unknown as AdminAuth;
  return { auth, llamadas };
}

const invitacion = {
  email: "ya-existe@example.test",
  displayName: "Alguien",
  role: "asesor" as const,
};

// `createAdvisorFromAuthUser` valida el id con `z.uuid()` antes de insertar: un
// id inventado sale por INVALID_ADVISOR y nunca llega al catch que se prueba.
const cuentaViva = randomUUID();
const recienCreado = randomUUID();

describe("createInvitedAdvisor", () => {
  it("rechaza un correo que ya tiene cuenta sin llegar a invitar", async () => {
    const { auth, llamadas } = fakeAdminAuth(cuentaViva);
    const result = await createInvitedAdvisor(
      invitacion,
      auth,
      fakeDatabase([[{ id: cuentaViva }]]),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ADVISOR_EXISTS");
    expect(llamadas.invitados).toBe(0);
    expect(llamadas.borrados).toEqual([]);
  });

  it("no borra el usuario de auth cuando la invitacion devolvio una cuenta que ya esta en el directorio", async () => {
    const { auth, llamadas } = fakeAdminAuth(cuentaViva);
    const result = await createInvitedAdvisor(
      invitacion,
      auth,
      fakeDatabase([[], [{ id: cuentaViva }]], () => {
        throw new Error("duplicate key value violates unique constraint");
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ADVISOR_CREATE_FAILED");
    expect(llamadas.borrados).toEqual([]);
  });

  it("si borra el usuario que ella misma creo cuando el insert falla", async () => {
    const { auth, llamadas } = fakeAdminAuth(recienCreado);
    const result = await createInvitedAdvisor(
      invitacion,
      auth,
      fakeDatabase([[], []], () => {
        throw new Error("cualquier otro fallo de base");
      }),
    );

    expect(result.ok).toBe(false);
    expect(llamadas.borrados).toEqual([recienCreado]);
  });
});
