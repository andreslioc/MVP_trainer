import { describe, expect, it } from "vitest";

import { formatMark, humanizeMark } from "../../src/lib/recordings.ts";

describe("formato de la marca de tiempo", () => {
  it("usa el mismo minuto:segundo que muestran los hallazgos", () => {
    expect(formatMark(1840)).toBe("30:40");
  });

  it("rellena el segundo a dos cifras", () => {
    expect(formatMark(124)).toBe("2:04");
  });

  it("pasada la hora muestra horas, minutos y segundos", () => {
    // 70:34 obliga a dividir entre 60 para saber que es la hora con diez.
    expect(formatMark(4234)).toBe("01:10:34");
    expect(formatMark(8523)).toBe("02:22:03");
  });

  it("justo en la hora ya cambia de formato", () => {
    expect(formatMark(3599)).toBe("59:59");
    expect(formatMark(3600)).toBe("01:00:00");
  });

  it("sin segundo no inventa un cero", () => {
    expect(formatMark(null)).toBeNull();
  });
});

describe("marca de una linea", () => {
  it("convierte la marca en segundos de la transcripcion", () => {
    expect(humanizeMark("[104s] [Speaker 0] para el resto")).toBe(
      "[1:44] [Speaker 0] para el resto",
    );
  });

  it("convierte la marca de hora del chat al mismo formato", () => {
    expect(humanizeMark("[00:30:40] @martha: cuanto vale")).toBe("[30:40] @martha: cuanto vale");
  });

  it("conserva la hora que traia el chat en vez de contar minutos de corrido", () => {
    // TikTok exporta [01:07:09]. Convertirlo a [67:09] perdia informacion que
    // ya venia bien en origen.
    expect(humanizeMark("[01:07:09] @gela21229: que precio tiene")).toBe(
      "[01:07:09] @gela21229: que precio tiene",
    );
  });

  it("acepta la marca de minuto y segundo del chat", () => {
    expect(humanizeMark("[05:02] @martha: cuanto vale")).toBe("[5:02] @martha: cuanto vale");
  });

  it("una linea sin marca queda intacta", () => {
    expect(humanizeMark("[Speaker 0] sin marca de tiempo")).toBe("[Speaker 0] sin marca de tiempo");
  });

  it("la marca coincide con la que muestra la pregunta del chat", () => {
    // Es el punto entero del cambio: verificar el minuto 30:40 de una pregunta
    // no puede obligar a dividir 1840 entre 60 mentalmente.
    const segundo = 1840;
    expect(humanizeMark(`[${segundo}s] la respuesta`)).toContain(`[${formatMark(segundo)}]`);
  });
});
