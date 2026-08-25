import { describe, expect, it } from "vitest";

import { visibleNavItems } from "../../src/components/layout/nav-items.ts";

// Pre-training va antes de Training a proposito: se estudia la ficha y despues
// se practica, y el orden del menu es el orden del dia de la asesora.
const sharedLabels = ["Inicio", "Pre-training", "Training", "Copilot", "Intelligence", "Knowledge"];

describe("visibleNavItems", () => {
  it("shows the working modules and hides Settings for an advisor", () => {
    expect(visibleNavItems("asesor").map((item) => item.label)).toEqual(sharedLabels);
  });

  it("adds Settings for an admin without changing the shared navigation", () => {
    expect(visibleNavItems("admin").map((item) => item.label)).toEqual([
      ...sharedLabels,
      "Settings",
    ]);
  });

  it("returns a fresh filtered list on every call", () => {
    expect(visibleNavItems("asesor")).not.toBe(visibleNavItems("asesor"));
  });
});
