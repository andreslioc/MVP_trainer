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
