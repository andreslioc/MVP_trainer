import { describe, expect, it } from "vitest";

import { visibleNavItems } from "../../src/components/layout/nav-items.ts";

// Pre-training va antes de Training a proposito: se estudia la ficha y despues
// se practica, y el orden del menu es el orden del dia de la asesora.
const trabajoDiario = ["Inicio", "Pre-training", "Training", "Copilot", "Intelligence"];

const etiquetas = (role: "asesor" | "supervisor" | "admin") =>
  visibleNavItems(role).map((item) => item.label);

describe("visibleNavItems", () => {
  it("la asesora ve solo los cinco modulos de su trabajo", () => {
    expect(etiquetas("asesor")).toEqual(trabajoDiario);
  });

  it("la asesora NO ve Knowledge: consume las fichas en Pre-training", () => {
    // Cambio de permiso: antes lo veia. Editar la fuente de verdad es trabajo
    // de quien responde por lo que se dice al aire.
    expect(etiquetas("asesor")).not.toContain("Knowledge");
  });

  it("la supervisora suma Knowledge, las reglas y las analiticas, sin cuentas", () => {
    // Las analiticas bajaron de administracion a supervision: el seguimiento
    // del equipo es su trabajo, y sin la entrada no tenia por donde entrar.
    expect(etiquetas("supervisor")).toEqual([
      ...trabajoDiario,
      "Knowledge",
      "Reglas",
      "Analíticas",
    ]);
  });

  it("la supervisora NO ve cuentas: los accesos son de administracion", () => {
    expect(etiquetas("supervisor")).not.toContain("Cuentas");
  });

  it("la administradora suma cuentas", () => {
    expect(etiquetas("admin")).toEqual([
      ...trabajoDiario,
      "Knowledge",
      "Reglas",
      "Analíticas",
      "Cuentas",
    ]);
  });

  it("returns a fresh filtered list on every call", () => {
    expect(visibleNavItems("asesor")).not.toBe(visibleNavItems("asesor"));
  });
});
