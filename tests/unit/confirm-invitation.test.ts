import { describe, expect, it, vi } from "vitest";

import { confirmInvitation } from "../../src/server/auth/confirm-invitation.ts";

function verificador(error: { message: string } | null = null) {
  return { verifyOtp: vi.fn(async () => ({ error })) };
}

describe("canje del enlace de invitación", () => {
  it("canjea el hash y devuelve el tipo de enlace", async () => {
    const auth = verificador();
    const result = await confirmInvitation(auth, { token_hash: "hash-de-prueba", type: "invite" });

    expect(result.ok).toBe(true);
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "hash-de-prueba",
      type: "invite",
    });
  });

  it("rechaza el enlace sin hash sin llamar al proveedor", async () => {
    const auth = verificador();
    const result = await confirmInvitation(auth, { token_hash: "", type: "invite" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_LINK");
    // Es el caso del flujo roto: el token venia en el fragmento, asi que al
    // servidor llegaba una URL sin hash. No se gasta una llamada en eso.
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("rechaza un tipo de enlace que no es de esta ruta", async () => {
    const auth = verificador();
    const result = await confirmInvitation(auth, { token_hash: "hash", type: "magiclink" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_LINK");
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("traduce un enlace ya usado o vencido a un mensaje con salida", async () => {
    const auth = verificador({ message: "Email link is invalid or has expired" });
    const result = await confirmInvitation(auth, { token_hash: "hash", type: "invite" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("LINK_EXPIRED");
    // El mensaje del proveedor llega en ingles y no dice que hacer. El nuestro
    // si: pedir una invitacion nueva.
    expect(result.error.message).toMatch(/invitación nueva/);
  });

  it("acepta un enlace de recuperación por el mismo camino", async () => {
    const auth = verificador();
    const result = await confirmInvitation(auth, { token_hash: "hash", type: "recovery" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.type).toBe("recovery");
  });
});
