import { describe, expect, it } from "vitest";

import {
  hasMarks,
  parseTranscript,
  sliceByFraction,
  sliceByTime,
} from "../../src/lib/transcript.ts";
import { transcriptFromPayload } from "../../src/server/recordings/transcription.ts";

describe("marcas de tiempo de la transcripcion", () => {
  it("lee el segundo del campo que Deepgram realmente emite", () => {
    const text = transcriptFromPayload({
      metadata: { duration: 3_600 },
      results: {
        channels: [{ alternatives: [{ transcript: "hola" }] }],
        utterances: [{ speaker: 0, transcript: "Eso vale 189 mil.", start: 302.4, end: 305 }],
      },
    });

    expect(text).toBe("[302s] [Speaker 0] Eso vale 189 mil.");
  });

  it("sigue aceptando el nombre largo, que emiten otras versiones", () => {
    const text = transcriptFromPayload({
      metadata: { duration: 3_600 },
      results: {
        channels: [{ alternatives: [{ transcript: "hola" }] }],
        utterances: [{ speaker: 1, transcript: "Claro que si.", start_time: 60, end_time: 62 }],
      },
    });

    expect(text).toBe("[60s] [Speaker 1] Claro que si.");
  });

  it("sin marca no inventa un cero", () => {
    const text = transcriptFromPayload({
      metadata: { duration: 3_600 },
      results: {
        channels: [{ alternatives: [{ transcript: "hola" }] }],
        utterances: [{ speaker: 0, transcript: "Eso vale 189 mil." }],
      },
    });

    expect(text).toBe("[Speaker 0] Eso vale 189 mil.");
    expect(hasMarks(parseTranscript(text))).toBe(false);
  });
});

describe("recorte por ventana", () => {
  const lines = parseTranscript(
    ["[0s] arranque", "[600s] medio", "[1200s] mas tarde", "[3600s] final"].join("\n"),
  );

  it("devuelve solo lo que cae dentro de la ventana", () => {
    const slice = sliceByTime(lines, 500, 1300);
    expect(slice).toContain("medio");
    expect(slice).toContain("mas tarde");
    expect(slice).not.toContain("arranque");
    expect(slice).not.toContain("final");
  });

  it("las lineas sin marca heredan el segundo de la ultima que si la traia", () => {
    const mixed = parseTranscript(["[600s] con marca", "sin marca", "[3600s] final"].join("\n"));
    expect(sliceByTime(mixed, 500, 700)).toContain("sin marca");
  });

  it("sin marcas recorta por posicion, con margen a cada lado", () => {
    const plain = parseTranscript(
      Array.from({ length: 100 }, (_value, index) => `linea ${index}`).join("\n"),
    );
    const slice = sliceByFraction(plain, 0, 600, 6_000);

    expect(slice).toContain("linea 0");
    expect(slice).not.toContain("linea 99");
  });

  it("sin duracion conocida no adivina: manda todo", () => {
    const plain = parseTranscript(["linea 0", "linea 1"].join("\n"));
    expect(sliceByFraction(plain, 0, 600, 0)).toContain("linea 1");
  });
});
