import { describe, expect, it } from "vitest";

import { transcribeNow } from "../../src/server/recordings/transcribe-now.ts";

const config = {
  apiKey: "llave-falsa",
  baseUrl: "https://api.deepgram.com/v1/listen",
  model: "nova-3",
  language: "es-419",
};

const payload = {
  metadata: { duration: 12.6 },
  results: {
    channels: [{ alternatives: [{ transcript: "Hola, hoy vemos la creatina. ¿Cómo se toma?" }] }],
    utterances: [
      { speaker: 0, transcript: "Hola, hoy vemos la creatina.", start_time: 1.2 },
      { speaker: 1, transcript: "¿Cómo se toma?", start_time: 9.7 },
    ],
  },
};

function fetcherReturning(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe("transcribeNow", () => {
  it("no pide callback: por eso funciona sin URL publica", async () => {
    const { fetcher, calls } = fetcherReturning(200, payload);

    await transcribeNow(
      { audio: new ArrayBuffer(8), contentType: "audio/mpeg" },
      { config, fetcher },
    );

    const url = new URL(calls[0]?.url ?? "");
    expect(url.searchParams.get("callback")).toBeNull();
    expect(url.searchParams.get("callback_method")).toBeNull();
    expect(url.searchParams.get("utterances")).toBe("true");
    expect(url.searchParams.get("diarize_model")).toBe("latest");
  });

  it("manda los bytes del audio en el cuerpo con su tipo", async () => {
    const { fetcher, calls } = fetcherReturning(200, payload);
    const audio = new ArrayBuffer(64);

    await transcribeNow({ audio, contentType: "audio/mpeg" }, { config, fetcher });

    const sent = calls[0];
    expect(sent).toBeDefined();
    if (!sent) return;
    expect(sent.init.body).toBe(audio);
    expect((sent.init.headers as Record<string, string>)["Content-Type"]).toBe("audio/mpeg");
  });

  it("conserva hablante y segundo de cada linea", async () => {
    const { fetcher } = fetcherReturning(200, payload);

    const result = await transcribeNow(
      { audio: new ArrayBuffer(8), contentType: "audio/mpeg" },
      { config, fetcher },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.transcript).toBe(
      "[1s] [Speaker 0] Hola, hoy vemos la creatina.\n[10s] [Speaker 1] ¿Cómo se toma?",
    );
    expect(result.data.durationS).toBe(13);
  });

  it("distingue el corte por duracion de una caida cualquiera", async () => {
    const cortado = await transcribeNow(
      { audio: new ArrayBuffer(8), contentType: "audio/mpeg" },
      { config, fetcher: fetcherReturning(504, {}).fetcher },
    );
    const caido = await transcribeNow(
      { audio: new ArrayBuffer(8), contentType: "audio/mpeg" },
      { config, fetcher: fetcherReturning(500, {}).fetcher },
    );

    expect(cortado.ok).toBe(false);
    expect(caido.ok).toBe(false);
    if (cortado.ok || caido.ok) return;
    expect(cortado.error.code).toBe("PROVIDER_TIMEOUT");
    expect(caido.error.code).toBe("PROVIDER_UNAVAILABLE");
  });

  it("un audio sin voz no pasa como transcripcion valida", async () => {
    const mudo = {
      metadata: { duration: 2 },
      results: { channels: [{ alternatives: [{ transcript: "" }] }], utterances: [] },
    };

    const result = await transcribeNow(
      { audio: new ArrayBuffer(8), contentType: "audio/wav" },
      { config, fetcher: fetcherReturning(200, mudo).fetcher },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PROVIDER_MALFORMED");
  });
});
