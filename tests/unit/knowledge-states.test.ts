import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Knowledge Hub states", () => {
  it("declares loading, empty and recoverable error states", () => {
    const page = source("../../src/app/(app)/app/knowledge/page.tsx");
    const loading = source("../../src/app/(app)/app/knowledge/loading.tsx");
    const error = source("../../src/app/(app)/app/knowledge/error.tsx");

    expect(loading).toContain("Cargando fichas");
    expect(page).toContain("Aún no hay fichas");
    expect(error).toContain("No se pudieron cargar las fichas");
    expect(error).toContain("Reintentar");
  });

  it("declares a no-match state and a labelled search control", () => {
    const page = source("../../src/app/(app)/app/knowledge/page.tsx");

    // Buscar agrega un cuarto estado a la lista: hay fichas, pero ninguna
    // coincide. Sin el, la cuadricula vacia se lee como "no hay fichas".
    expect(page).toContain("Ninguna ficha coincide");
    expect(page).toContain('htmlFor="knowledge-q"');
    expect(page).toContain("Buscar ficha");
  });

  it("keeps field errors next to controls and exposes a textual server error", () => {
    const form = source("../../src/app/(app)/app/knowledge/product-form.tsx");
    const benefits = source("../../src/app/(app)/app/knowledge/benefits-fields.tsx");

    expect(form).toContain("errors[name]");
    expect(form).toContain('role="alert"');
    expect(benefits).toContain("errors.benefits");
  });
});
