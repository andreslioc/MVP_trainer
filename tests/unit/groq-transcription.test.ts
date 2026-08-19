import { describe, expect, it } from "vitest";

import { transcribeWithGroq } from "../../src/server/recordings/groq.ts";

const config = {
  apiKey: "llave-falsa",
  baseUrl: "https://api.groq.com/openai/v1",
  model: "whisper-large-v3-turbo",
  language: "es",
};

const payload = {
  text: "Hola, hoy vemos la creatina. Se toma con agua.",
  duration: 18.4,
  segments: [
    { start: 0.8, text: " Hola, hoy vemos la creatina." },
    { start: 11.6, text: " Se toma con agua." },
  ],
};

function fetcherReturning(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe("transcribeWithGroq", () => {
  it("conserva el segundo de cada linea, que es lo que el analisis usa", async () => {
    const result = await transcribeWithGroq(
      { audio: new ArrayBuffer(8), contentType: "audio/ogg" },
      { config, fetcher: fetcherReturning(200, payload).fetcher },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.transcript).toBe(
      "[1s] Hola, hoy vemos la creatina.\n[12s] Se toma con agua.",
    );
    expect(result.data.durationS).toBe(18);
  });

  it("pide los segmentos: sin eso la respuesta viene sin tiempos", async () => {
    const { fetcher, calls } = fetcherReturning(200, payload);

    await transcribeWithGroq(
      { audio: new ArrayBuffer(8), contentType: "audio/ogg" },
      {
        config,
        fetcher,
      },
    );

    const sent = calls[0];
    expect(sent).toBeDefined();
    if (!sent) return;
    const form = sent.init.body as FormData;
    expect(form.get("response_format")).toBe("verbose_json");
    expect(form.get("timestamp_granularities[]")).toBe("segment");
    expect(form.get("model")).toBe("whisper-large-v3-turbo");
    expect(form.get("language")).toBe("es");
  });

  it("cae al texto corrido si el proveedor no manda segmentos", async () => {
    const result = await transcribeWithGroq(
      { audio: new ArrayBuffer(8), contentType: "audio/ogg" },
      { config, fetcher: fetcherReturning(200, { text: "Hola a todas.", duration: 3 }).fetcher },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.transcript).toBe("Hola a todas.");
  });

  it("no manda a esperar cuando esperar no arregla nada: la grabacion es muy larga", async () => {
    // Cuerpo real que devolvio Groq con un live de 2,83 h en el tier gratuito.
    const cuerpo = {
      error: {
        message:
          "Request too large for model `whisper-large-v3-turbo` in organization `org_x` " +
          "service tier `on_demand` on seconds of audio per hour (ASPH): Limit 7200, " +
          "Requested 10200, please reduce your message size and try again.",
        code: "rate_limit_exceeded",
      },
    };

    // Llega como 413, no como 429: comprobado contra la API real. Clasificarlo
    // por estado lo confundia con "el archivo pesa demasiado" y mandaba a
    // comprimir un audio que ya estaba en 17 MB.
    for (const estado of [413, 429]) {
      const result = await transcribeWithGroq(
        { audio: new ArrayBuffer(8), contentType: "audio/ogg" },
        { config, fetcher: fetcherReturning(estado, cuerpo).fetcher },
      );

      expect(result.ok, `estado ${estado}`).toBe(false);
      if (result.ok) return;
      expect(result.error.code, `estado ${estado}`).toBe("TOO_LONG");
      expect(result.error.message).toContain("170 minutos");
      expect(result.error.message).toContain("120");
      expect(result.error.message).toContain("Deepgram");
    }
  });

  it("un 413 sin el detalle de segundos si es un problema de tamaño", async () => {
    const result = await transcribeWithGroq(
      { audio: new ArrayBuffer(8), contentType: "audio/ogg" },
      {
        config,
        fetcher: fetcherReturning(413, { error: { message: "payload too large" } }).fetcher,
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("TOO_LARGE");
  });

  it("si de verdad se agoto la cuota, ahi si dice que espere", async () => {
    const result = await transcribeWithGroq(
      { audio: new ArrayBuffer(8), contentType: "audio/ogg" },
      {
        config,
        fetcher: fetcherReturning(429, { error: { message: "rate limit reached" } }).fetcher,
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("QUOTA_EXCEEDED");
  });

  it("distingue el archivo demasiado grande de una caida cualquiera", async () => {
    const grande = await transcribeWithGroq(
      { audio: new ArrayBuffer(8), contentType: "audio/ogg" },
      { config, fetcher: fetcherReturning(413, {}).fetcher },
    );
    const caido = await transcribeWithGroq(
      { audio: new ArrayBuffer(8), contentType: "audio/ogg" },
      { config, fetcher: fetcherReturning(500, {}).fetcher },
    );

    expect(grande.ok).toBe(false);
    expect(caido.ok).toBe(false);
    if (grande.ok || caido.ok) return;
    expect(grande.error.code).toBe("TOO_LARGE");
    expect(caido.error.code).toBe("PROVIDER_UNAVAILABLE");
  });
});
