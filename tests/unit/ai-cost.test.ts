import { describe, expect, it } from "vitest";

import { readAiCostByDay } from "../../src/server/ai-cost.ts";

/**
 * El gasto de IA por dia.
 *
 * Lo que se afirma aqui es lo que hace util la tarjeta frente al acumulado que
 * habia antes: que el promedio sea POR DIA DE LA VENTANA, que los dias sin gasto
 * cuenten como cero en vez de desaparecer, y que solo un admin lo vea.
 */
const admin = async () => ({ ok: true as const, data: { id: "a1", role: "admin" as const } });
const asesora = async () => ({
  ok: false as const,
  error: { code: "FORBIDDEN", message: "No tienes permiso." },
});

/** Fila tal como la devuelve Postgres: `numeric` llega como string. */
function baseDeDatos(filas: Array<{ day: string; costUsd: string; calls: number }>) {
  const cadena = {
    from: () => cadena,
    where: () => cadena,
    groupBy: () => cadena,
    orderBy: async () => filas,
  };
  return { select: () => cadena } as never;
}

// Un martes, para que la ventana de siete dias sea del 2 al 8.
const ahora = () => new Date("2026-09-08T15:00:00-05:00");

describe("costo de IA por dia", () => {
  it("solo lo ve un admin", async () => {
    const result = await readAiCostByDay(
      { period: "semana" },
      { authorize: asesora, database: baseDeDatos([]), now: ahora },
    );

    expect(result.ok).toBe(false);
  });

  it("rellena en cero los dias sin gasto en vez de omitirlos", async () => {
    const result = await readAiCostByDay(
      { period: "semana" },
      {
        authorize: admin,
        database: baseDeDatos([{ day: "2026-09-08", costUsd: "1.400000", calls: 20 }]),
        now: ahora,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Siete columnas siempre: una grafica con huecos hace creer que la ventana
    // es mas corta de lo que es.
    expect(result.data.days).toHaveLength(7);
    expect(result.data.days.map((d) => d.day)).toEqual([
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
    ]);
    expect(result.data.days[0]).toEqual({ day: "2026-09-02", costUsd: 0, calls: 0 });
  });

  it("promedia entre los dias de la VENTANA, no entre los que tuvieron gasto", async () => {
    const result = await readAiCostByDay(
      { period: "semana" },
      {
        authorize: admin,
        database: baseDeDatos([
          { day: "2026-09-07", costUsd: "3.500000", calls: 50 },
          { day: "2026-09-08", costUsd: "3.500000", calls: 50 },
        ]),
        now: ahora,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.costUsd).toBeCloseTo(7, 6);
    // 7 dolares entre SIETE dias, no entre los dos que gastaron: quien mira
    // esto pregunta cuanto cuesta una semana, y una semana tiene siete dias.
    expect(result.data.avgPerDayUsd).toBeCloseTo(1, 6);
  });

  it("convierte el numeric de Postgres, que llega como texto", async () => {
    const result = await readAiCostByDay(
      { period: "semana" },
      {
        authorize: admin,
        database: baseDeDatos([{ day: "2026-09-08", costUsd: "0.004321", calls: 3 }]),
        now: ahora,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.costUsd).toBeCloseTo(0.004321, 9);
    expect(result.data.costPerCallUsd).toBeCloseTo(0.004321 / 3, 9);
  });

  it("el costo por llamada es nulo sin llamadas, no cero", async () => {
    const result = await readAiCostByDay(
      { period: "semana" },
      { authorize: admin, database: baseDeDatos([]), now: ahora },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Un cero aqui se leeria como "cada llamada sale gratis".
    expect(result.data.costPerCallUsd).toBeNull();
    expect(result.data.peak).toBeNull();
  });

  it("señala el dia mas caro de la ventana", async () => {
    const result = await readAiCostByDay(
      { period: "semana" },
      {
        authorize: admin,
        database: baseDeDatos([
          { day: "2026-09-03", costUsd: "0.500000", calls: 10 },
          { day: "2026-09-06", costUsd: "4.200000", calls: 12 },
          { day: "2026-09-08", costUsd: "1.100000", calls: 40 },
        ]),
        now: ahora,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.peak?.day).toBe("2026-09-06");
    // Y el pico con POCAS llamadas es justo la señal que se busca: 12 llamadas
    // costando cuatro veces mas que 40 es una llamada cara, no mas trabajo.
    expect(result.data.peak?.calls).toBe(12);
  });

  it("rechaza un periodo que no existe", async () => {
    const result = await readAiCostByDay(
      { period: "trimestre" as never },
      { authorize: admin, database: baseDeDatos([]), now: ahora },
    );

    expect(result.ok).toBe(false);
  });
});
