import { describe, expect, it } from "vitest";

import {
  isMonday,
  weekBounds,
  weekStartFor,
  weeklyGoalStatus,
} from "../../src/lib/weekly-goals.ts";

const metrics = (current: number) => ({
  training: { current, target: 3 },
  pretraining: { current: 0, target: 60 },
  products: { current: 0, target: 0 },
});

describe("weekly goals", () => {
  it("encuentra el lunes de la semana en Bogota, incluso cerca de medianoche UTC", () => {
    expect(weekStartFor(new Date("2026-09-21T04:30:00Z"))).toBe("2026-09-14");
    expect(weekStartFor(new Date("2026-09-21T05:30:00Z"))).toBe("2026-09-21");
  });

  it("calcula los limites lunes a domingo", () => {
    expect(isMonday("2026-09-21")).toBe(true);
    expect(isMonday("2026-09-22")).toBe(false);
    expect(isMonday("2026-02-30")).toBe(false);
    expect(weekBounds("2026-09-21")).toEqual(
      expect.objectContaining({ weekEnd: "2026-09-27", nextWeekStart: "2026-09-28" }),
    );
  });

  it("distingue sin iniciar, en progreso, cumplida y vencida", () => {
    expect(
      weeklyGoalStatus(metrics(0), "2026-09-21", new Date("2026-09-22T15:00:00Z")).status,
    ).toBe("sin_iniciar");
    expect(
      weeklyGoalStatus(metrics(1), "2026-09-21", new Date("2026-09-22T15:00:00Z")).status,
    ).toBe("en_progreso");
    expect(
      weeklyGoalStatus(
        {
          training: { current: 3, target: 3 },
          pretraining: { current: 60, target: 60 },
          products: { current: 0, target: 0 },
        },
        "2026-09-21",
        new Date("2026-09-22T15:00:00Z"),
      ),
    ).toEqual({ status: "cumplida", percentage: 100 });
    expect(
      weeklyGoalStatus(metrics(1), "2026-09-14", new Date("2026-09-22T15:00:00Z")).status,
    ).toBe("vencida");
  });
});
