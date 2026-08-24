import { describe, expect, it } from "vitest";

import { recordingFileProblem } from "../../src/lib/recordings.ts";

const CINCUENTA_MB = 50 * 1024 * 1024;
const video = { type: "video/mp4", size: 549 * 1024 * 1024 };

describe("archivo pesado con conversión disponible", () => {
  it("lo deja pasar: la página lo encoge antes de subirlo", () => {
    // El video de un live pesa cientos de megas y el 98% es imagen que nadie
    // transcribe. Rechazarlo obligaba a convertirlo a mano en una terminal.
    expect(recordingFileProblem(video, CINCUENTA_MB, true)).toBeNull();
  });

  it("sin conversión explica qué hacer, sin pedir una terminal", () => {
    const problema = recordingFileProblem(video, CINCUENTA_MB, false);
    expect(problema).toContain("Chrome o Edge");
    expect(problema).not.toContain("ffmpeg");
  });

  it("un archivo pequeño pasa igual, con o sin conversión", () => {
    const audio = { type: "audio/ogg", size: 15 * 1024 * 1024 };
    expect(recordingFileProblem(audio, CINCUENTA_MB, false)).toBeNull();
    expect(recordingFileProblem(audio, CINCUENTA_MB, true)).toBeNull();
  });

  it("sigue rechazando un formato que no se admite", () => {
    expect(
      recordingFileProblem({ type: "application/pdf", size: 1_000 }, CINCUENTA_MB, true),
    ).toContain("formato");
  });

  it("hay un techo que ni convirtiendo se supera", () => {
    // Convertir en el navegador tiene un limite practico de memoria y tiempo.
    // Aceptar cualquier tamano prometeria algo que se rompe a la mitad.
    const enorme = { type: "video/mp4", size: 5 * 1024 * 1024 * 1024 };
    expect(recordingFileProblem(enorme, CINCUENTA_MB, true)).not.toBeNull();
  });

  it("el archivo vacío se detecta antes que el tamaño", () => {
    expect(recordingFileProblem({ type: "audio/ogg", size: 0 }, CINCUENTA_MB, true)).toContain(
      "vacío",
    );
  });
});
