import { describe, expect, it } from "vitest";

import {
  PERIOD_LABELS,
  businessToday,
  parsePeriod,
  periodColumnDays,
  periodDayKeys,
  periodStart,
  shiftBusinessDay,
} from "../../src/lib/analytics-period.ts";

// 2 de septiembre de 2026, 23:30 UTC = 18:30 en Bogota, todavia dia 2.
const tardeEnBogota = new Date("2026-09-02T23:30:00Z");
// 3 de septiembre, 02:00 UTC = 21:00 del dia 2 en Bogota.
const yaEsManianaEnUtc = new Date("2026-09-03T02:00:00Z");

describe("ventana de las analíticas", () => {
  it("cuenta el día en la zona del negocio, no en UTC", () => {
    // Es el fallo que evita: a las 9 de la noche en Colombia el servidor ya esta
    // en el dia siguiente, y "Hoy" mostraria cero teniendo practicas de la tarde.
    expect(businessToday(tardeEnBogota)).toBe("2026-09-02");
    expect(businessToday(yaEsManianaEnUtc)).toBe("2026-09-02");
  });

  it("la ventana de un día empieza a medianoche de hoy en Bogotá", () => {
    const inicio = periodStart("dia", yaEsManianaEnUtc);
    expect(inicio?.toISOString()).toBe("2026-09-02T05:00:00.000Z");
  });

  it("una ventana de siete días incluye hoy, así que arranca seis días atrás", () => {
    // Restar siete daria OCHO dias en pantalla.
    const inicio = periodStart("semana", tardeEnBogota);
    expect(inicio?.toISOString()).toBe("2026-08-27T05:00:00.000Z");
    expect(periodDayKeys("semana", tardeEnBogota)).toHaveLength(7);
    expect(periodDayKeys("semana", tardeEnBogota)[0]).toBe("2026-08-27");
    expect(periodDayKeys("semana", tardeEnBogota).at(-1)).toBe("2026-09-02");
  });

  it("la ventana de treinta días cruza el cambio de mes sin saltarse días", () => {
    const dias = periodDayKeys("mes", tardeEnBogota);
    expect(dias).toHaveLength(30);
    expect(dias[0]).toBe("2026-08-04");
    expect(new Set(dias).size).toBe(30);
  });

  it("«todo» no tiene inicio pero sí un tope de columnas", () => {
    expect(periodStart("todo", tardeEnBogota)).toBeNull();
    expect(periodColumnDays("todo")).toBe(30);
  });

  it("resta días sobre el calendario, no sobre milisegundos", () => {
    expect(shiftBusinessDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftBusinessDay("2024-03-01", -1)).toBe("2024-02-29");
    expect(shiftBusinessDay("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("cae en treinta días ante un periodo inventado", () => {
    // Llega del query string, asi que puede ser cualquier cosa.
    expect(parsePeriod("mes")).toBe("mes");
    expect(parsePeriod("dia")).toBe("dia");
    expect(parsePeriod("trimestre")).toBe("mes");
    expect(parsePeriod(undefined)).toBe("mes");
    expect(parsePeriod(7)).toBe("mes");
  });

  it("cada ventana tiene una etiqueta para el selector", () => {
    expect(PERIOD_LABELS.dia).toBe("Hoy");
    expect(PERIOD_LABELS.todo).toBe("Todo");
  });
});
