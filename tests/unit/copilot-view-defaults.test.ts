import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { COPILOT_VIEW_DEFAULTS } from "../../src/lib/copilot/view-defaults.ts";

describe("Copilot view defaults", () => {
  it("keeps Express as the default with its live reading target", () => {
    expect(COPILOT_VIEW_DEFAULTS.variant).toBe("express");
    expect(COPILOT_VIEW_DEFAULTS.durationLabels.express).toBe("15–20 s");
  });

  it("labels confidence in text instead of relying only on color", () => {
    const source = readFileSync("src/components/copilot/answer-panel.tsx", "utf8");
    expect(source).toContain("Confianza: {composition.confidence}");
  });
});
