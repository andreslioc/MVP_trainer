import { describe, expect, it } from "vitest";

import { CONFIRM_PATH, CONFIRM_TYPES, buildConfirmUrl } from "../../src/lib/invite-link.ts";

describe("enlace de invitación", () => {
  it("apunta a la ruta que canjea el token, no a la raíz", () => {
    // La raiz era el destino del flujo roto: alli el token llegaba en el
    // fragmento y el proxy redirigia a /login antes de que nadie lo leyera.
    expect(buildConfirmUrl("https://mvp-trainer.vercel.app")).toBe(
      `https://mvp-trainer.vercel.app${CONFIRM_PATH}`,
    );
    expect(CONFIRM_PATH).not.toBe("/");
  });

  it("no duplica la barra cuando la base ya la trae", () => {
    expect(buildConfirmUrl("http://127.0.0.1:3000/")).toBe(`http://127.0.0.1:3000${CONFIRM_PATH}`);
    expect(buildConfirmUrl("http://127.0.0.1:3000///")).toBe(
      `http://127.0.0.1:3000${CONFIRM_PATH}`,
    );
  });

  it("falla en voz alta con una base vacía en vez de armar una URL relativa", () => {
    // Una URL relativa la aceptaria Supabase y devolveria a su propio dominio:
    // el fallo tiene que ser aqui, no en el correo de una persona real.
    expect(() => buildConfirmUrl("")).toThrow(/APP_BASE_URL/);
    expect(() => buildConfirmUrl("   ")).toThrow(/APP_BASE_URL/);
  });

  it("acepta invitación y recuperación, que se canjean igual", () => {
    expect(CONFIRM_TYPES).toContain("invite");
    expect(CONFIRM_TYPES).toContain("recovery");
  });
});
