import { afterEach, describe, expect, it, vi } from "vitest";

import { env } from "../../src/lib/env.ts";
import { GROQ_MAX_AUDIO_SECONDS } from "../../src/server/recordings/groq.ts";
import { resolveProvider } from "../../src/server/recordings/transcribe-now.ts";

/**
 * El tope de Groq es por ventana de una hora, no por peticion: trocear no lo
 * esquiva. Con una grabacion que no le cabe hay que irse a Deepgram o fallar, y
 * cual de las dos ocurre decide si la asesora puede analizar su live.
 */
function conEntorno(valores: Partial<typeof env>) {
  const previos = { ...env };
  Object.assign(env, valores);
  return () => Object.assign(env, previos);
}

describe("resolveProvider", () => {
  const restauradores: Array<() => void> = [];
  afterEach(() => {
    while (restauradores.length) restauradores.pop()?.();
    vi.restoreAllMocks();
  });

  function fijar(valores: Partial<typeof env>) {
    restauradores.push(conEntorno(valores));
  }

  it("usa Groq mientras la grabación le quepa", () => {
    fijar({ TRANSCRIPTION_PROVIDER: "groq", DEEPGRAM_API_KEY: "llave" });

    expect(resolveProvider(GROQ_MAX_AUDIO_SECONDS - 1).nombre).toBe("groq");
    expect(resolveProvider(GROQ_MAX_AUDIO_SECONDS).nombre).toBe("groq");
  });

  it("se pasa a Deepgram cuando no le cabe, en vez de fallar", () => {
    fijar({ TRANSCRIPTION_PROVIDER: "groq", DEEPGRAM_API_KEY: "llave" });
    vi.spyOn(console, "error").mockImplementation(() => {});

    // 8.523 s es el live real que devolvio 413 con "Limit 7200".
    expect(resolveProvider(8523).nombre).toBe("deepgram");
  });

  it("sin Deepgram configurado se queda en Groq y falla con su mensaje", () => {
    // Inventar un proveedor que no existe seria peor que el error claro de Groq.
    fijar({ TRANSCRIPTION_PROVIDER: "groq", DEEPGRAM_API_KEY: undefined });

    expect(resolveProvider(8523).nombre).toBe("groq");
  });

  it("con duración desconocida intenta Groq: no gasta crédito por una sospecha", () => {
    fijar({ TRANSCRIPTION_PROVIDER: "groq", DEEPGRAM_API_KEY: "llave" });

    expect(resolveProvider(null).nombre).toBe("groq");
  });

  it("configurado en deepgram no se va a Groq por corta que sea", () => {
    fijar({ TRANSCRIPTION_PROVIDER: "deepgram", DEEPGRAM_API_KEY: "llave" });

    expect(resolveProvider(60).nombre).toBe("deepgram");
    expect(resolveProvider(null).nombre).toBe("deepgram");
  });
});

describe("un archivo pequeño pero largo", () => {
  it("va a Deepgram: el tamaño no dice cuánto dura", () => {
    // Caso real: un live de 2 h 22 min convertido a opus pesa 17 MB, menos que
    // muchos archivos cortos sin comprimir. Groq lo rechaza porque supera sus
    // 7.200 s por hora de reloj, y sin la duración no había forma de saberlo.
    const provider = resolveProvider(8_523, 17 * 1024 * 1024);
    expect(provider.nombre).toBe("deepgram");
  });

  it("uno corto y pequeño se queda en Groq, que es gratis", () => {
    expect(resolveProvider(300, 2 * 1024 * 1024).nombre).toBe("groq");
  });

  it("sin duración conocida sigue decidiendo por tamaño", () => {
    expect(resolveProvider(null, 60 * 1024 * 1024).nombre).toBe("deepgram");
    expect(resolveProvider(null, 2 * 1024 * 1024).nombre).toBe("groq");
  });
});
