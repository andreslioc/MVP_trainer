import { describe, expect, it } from "vitest";

import { ADVISOR_ROLES, hasRole, ROLE_LABELS } from "../../src/lib/roles.ts";

/**
 * Los tres rangos y lo que ve cada uno. Es la prueba que hay que leer para
 * saber quien entra a que: si manana cambia el permiso de un modulo, cambia
 * aca primero.
 */
describe("jerarquia de rangos", () => {
  it("un rango mayor incluye lo que puede el menor", () => {
    expect(hasRole("admin", "asesor")).toBe(true);
    expect(hasRole("admin", "supervisor")).toBe(true);
    expect(hasRole("supervisor", "asesor")).toBe(true);
  });

  it("un rango menor no alcanza al mayor", () => {
    expect(hasRole("asesor", "supervisor")).toBe(false);
    expect(hasRole("asesor", "admin")).toBe(false);
    expect(hasRole("supervisor", "admin")).toBe(false);
  });

  it("cada rango se alcanza a si mismo", () => {
    expect(hasRole("asesor", "asesor")).toBe(true);
    expect(hasRole("supervisor", "supervisor")).toBe(true);
    expect(hasRole("admin", "admin")).toBe(true);
  });
});

describe("nombres de los rangos", () => {
  it("nombra la funcion y no a la persona: sin genero", () => {
    expect(ROLE_LABELS).toEqual({
      asesor: "Asesoría",
      supervisor: "Supervisión",
      admin: "Administración",
    });
  });

  it("tiene una etiqueta para cada rango, sin faltantes", () => {
    for (const role of ADVISOR_ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
  });

  it("ninguna etiqueta termina en -ora ni en -sora", () => {
    // El gate que evita que vuelvan "Asesora" y "Administradora" al reescribir
    // esta pantalla dentro de seis meses.
    for (const etiqueta of Object.values(ROLE_LABELS)) {
      expect(etiqueta).not.toMatch(/(ora|sora)$/i);
    }
  });
});
