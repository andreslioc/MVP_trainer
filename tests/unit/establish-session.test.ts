import { describe, expect, it, vi } from "vitest";

import { establishSession } from "../../src/server/auth/establish-session.ts";

function conector(error: { message: string } | null = null) {
  return { setSession: vi.fn(async () => ({ error })) };
}

describe("sesión desde los tokens del fragmento", () => {
  it("guarda la sesión con los dos tokens del enlace", async () => {
    const auth = conector();
    const result = await establishSession(auth, {
      accessToken: "token-de-acceso",
      refreshToken: "token-de-refresco",
    });

    expect(result.ok).toBe(true);
    // Los nombres cambian de forma al cruzar al proveedor: camelCase de este
    // lado, snake_case del suyo. Es el punto exacto donde se traducen.
    expect(auth.setSession).toHaveBeenCalledWith({
      access_token: "token-de-acceso",
      refresh_token: "token-de-refresco",
    });
  });

  it("rechaza un enlace al que le falta el token de refresco", async () => {
    const auth = conector();
    const result = await establishSession(auth, { accessToken: "solo-uno", refreshToken: "" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_LINK");
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it("rechaza el caso sin fragmento sin llamar al proveedor", async () => {
    const auth = conector();
    const result = await establishSession(auth, {});

    expect(result.ok).toBe(false);
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it("traduce un token vencido a un mensaje con salida", async () => {
    const auth = conector({ message: "Invalid Refresh Token" });
    const result = await establishSession(auth, { accessToken: "a", refreshToken: "b" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("LINK_EXPIRED");
    expect(result.error.message).toMatch(/invitación nueva/);
  });
});
