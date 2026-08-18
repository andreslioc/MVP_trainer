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

  it("keeps field errors next to controls and exposes a textual server error", () => {
    const form = source("../../src/app/(app)/app/knowledge/product-form.tsx");
    const benefits = source("../../src/app/(app)/app/knowledge/benefits-fields.tsx");

    expect(form).toContain("errors[name]");
    expect(form).toContain('role="alert"');
    expect(benefits).toContain("errors.benefits");
  });
});
