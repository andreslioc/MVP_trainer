import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConfidenceBadge, type ConfidenceLevel } from "../../src/components/confidence-badge.tsx";

const styles = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");

describe("design tokens", () => {
  it("defines the accessible control, text and confidence colors in @theme", () => {
    expect(styles).toContain("@theme {");
    expect(styles).toMatch(/--border-control:\s*#64748b;/i);
    for (const token of [
      "--primary: #5b21b6",
      "--primary-deep: #4c1d95",
      "--background: #f8fafc",
      "--fg: #0f172a",
      "--confidence-high-bg: #dcfce7",
      "--confidence-mid-bg: #fef9c3",
      "--confidence-low-bg: #fee2e2",
    ]) {
      expect(styles).toContain(token);
    }
  });

  it("keeps a visible focus ring and removes motion when requested", () => {
    expect(styles).toMatch(/:focus-visible\s*{[^}]*var\(--primary-deep\)/s);
    expect(styles).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(styles).not.toMatch(/prefers-color-scheme:\s*dark/);
  });

  it("pairs every confidence color with an explicit text label", () => {
    const levels: ConfidenceLevel[] = ["alto", "medio", "revisar"];
    const markup = levels.map((level) =>
      renderToStaticMarkup(createElement(ConfidenceBadge, { level })),
    );

    expect(markup.join(" ")).toContain("Alto");
    expect(markup.join(" ")).toContain("Medio");
    expect(markup.join(" ")).toContain("Revisar");
  });
});
