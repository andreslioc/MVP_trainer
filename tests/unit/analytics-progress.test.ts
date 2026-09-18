import { describe, expect, it } from "vitest";

import { buildProgressComparison, comparisonWindow } from "../../src/lib/analytics-progress.ts";

const scoreSet = (
  accuracyPercent: number | null,
  dimensions: Array<{ dimension: string; average: number; answers?: number }>,
) => ({
  accuracyPercent,
  scoredAnswers: dimensions[0]?.answers ?? 0,
  dimensions: dimensions.map((dimension) => ({ answers: 4, ...dimension })),
});

describe("buildProgressComparison", () => {
  it("separa el mayor avance de la dimension mas baja", () => {
    const progress = buildProgressComparison(
      scoreSet(70, [
        { dimension: "claridad_explicacion", average: 4, answers: 5 },
        { dimension: "uso_cta", average: 2.4, answers: 5 },
      ]),
      scoreSet(55, [
        { dimension: "claridad_explicacion", average: 2.8, answers: 4 },
        { dimension: "uso_cta", average: 2.5, answers: 4 },
      ]),
      "frente al periodo anterior",
    );

    expect(progress.accuracyDelta).toBe(15);
    expect(progress.improved).toEqual(
      expect.objectContaining({ dimension: "claridad_explicacion", delta: 1.2 }),
    );
    expect(progress.focus).toEqual(expect.objectContaining({ dimension: "uso_cta", average: 2.4 }));
  });

  it("no inventa una mejora cuando no existe base anterior", () => {
    const progress = buildProgressComparison(
      scoreSet(60, [{ dimension: "uso_cta", average: 3, answers: 2 }]),
      scoreSet(null, []),
      "frente al periodo anterior",
    );

    expect(progress.accuracyDelta).toBeNull();
    expect(progress.improved).toBeNull();
    expect(progress.focus?.dimension).toBe("uso_cta");
  });
});

describe("comparisonWindow", () => {
  it("usa treinta dias recientes para Todo y una ventana anterior contigua", () => {
    const window = comparisonWindow("todo", new Date("2026-09-18T15:00:00Z"));
    expect(window.currentStart.toISOString()).toBe("2026-08-20T05:00:00.000Z");
    expect(window.previousStart.toISOString()).toBe("2026-07-21T05:00:00.000Z");
  });
});
