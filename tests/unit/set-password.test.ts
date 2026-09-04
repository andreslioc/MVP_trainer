import { describe, expect, it, vi } from "vitest";

import { setPassword } from "../../src/server/auth/set-password.ts";

/**
 * Que una sesion abierta no baste para cambiarle la contrasena a su cuenta.
 *
 * Es la regla que faltaba: la admin que abria el enlace de una invitacion con
 * su sesion puesta terminaba cambiando SU contrasena, la pantalla la mandaba a
 * la app como si todo hubiera salido bien, y el destrozo aparecia en el
 * siguiente inicio de sesion.
 */
function conector(signInError: { message: string } | null = null) {
  return {
    updateUser: vi.fn(async () => ({ error: null })),
    signInWithPassword: vi.fn(async () => ({ error: signInError })),
  };
}

const nueva = { password: "contrasena-nueva-1", confirmation: "contrasena-nueva-1" };
const desdeInvitacion = { email: "invitada@example.test", fromInvitation: true };
const sesionCualquiera = { email: "admin@example.test", fromInvitation: false };

describe("setPassword", () => {
  it("escribe sin pedir la anterior cuando la sesion viene de canjear el enlace", async () => {
    const auth = conector();
    const result = await setPassword(auth, nueva, desdeInvitacion);

    expect(result.ok).toBe(true);
    expect(auth.updateUser).toHaveBeenCalledWith({ password: nueva.password });
    // No hay contrasena anterior que verificar: la cuenta acaba de nacer.
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("no toca la contrasena de una sesion que no viene de una invitacion", async () => {
    const auth = conector();
    const result = await setPassword(auth, nueva, sesionCualquiera);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CURRENT_PASSWORD_REQUIRED");
    // El mensaje nombra la cuenta: es lo que delata que no es la que se creia.
    expect(result.error.message).toContain(sesionCualquiera.email);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("rechaza una contrasena actual que no coincide", async () => {
    const auth = conector({ message: "Invalid login credentials" });
    const result = await setPassword(
      auth,
      { ...nueva, currentPassword: "la-que-no-es" },
      sesionCualquiera,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CURRENT_PASSWORD_INVALID");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("verifica la contrasena actual contra el correo de la SESION, no contra uno del formulario", async () => {
    const auth = conector();
    const result = await setPassword(
      auth,
      { ...nueva, currentPassword: "la-de-verdad", email: "otra@example.test" },
      sesionCualquiera,
    );

    expect(result.ok).toBe(true);
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: sesionCualquiera.email,
      password: "la-de-verdad",
    });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: nueva.password });
  });

  it("no acepta espacios como contrasena actual", async () => {
    const auth = conector();
    const result = await setPassword(auth, { ...nueva, currentPassword: "   " }, sesionCualquiera);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CURRENT_PASSWORD_REQUIRED");
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("sigue exigiendo que las dos contrasenas coincidan", async () => {
    const auth = conector();
    const result = await setPassword(
      auth,
      { password: "contrasena-nueva-1", confirmation: "otra-cosa-distinta" },
      desdeInvitacion,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_PASSWORD");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});
