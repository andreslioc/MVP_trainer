import { afterEach, describe, expect, it, vi } from "vitest";

import { createAiGateway } from "../../src/lib/ai/gateway.ts";

/**
 * La busqueda web se prueba contra el cuerpo HTTP y no contra un cliente falso:
 * lo que importa es exactamente lo que sale hacia el proveedor. Que la
 * herramienta viaje es lo unico que el codigo puede garantizar — que el modelo
 * la USE depende del prompt, y eso vive en las reglas de research-product.ts.
 */
function stubFetch(payload: unknown) {
  const calls: Array<Record<string, unknown>> = [];
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return calls;
}

function groundedPayload() {
  return {
    candidates: [
      {
        content: { parts: [{ text: "La etiqueta declara 14 mg por porcion." }] },
        finishReason: "STOP",
        groundingMetadata: {
          webSearchQueries: ["oregano oil label"],
          groundingChunks: [
            { web: { uri: "https://redirect.test/uno", title: "pipingrock.com" } },
            { web: { uri: "https://redirect.test/uno", title: "pipingrock.com" } },
            { web: { uri: "https://redirect.test/dos", title: "ebay.com" } },
          ],
        },
      },
    ],
    responseId: "res_1",
    modelVersion: "modelo-de-prueba",
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
  };
}

const gateway = () => createAiGateway({ writeCall: async () => ({ ok: true, data: null }) });
const input = {
  advisorId: null,
  purpose: "research_product",
  promptId: null,
  system: "Investiga",
  messages: [{ role: "user" as const, content: "Aceite de oregano" }],
  maxTokens: 1_000,
  effort: "high" as const,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("busqueda web en el gateway", () => {
  it("manda la herramienta de busqueda en el cuerpo", async () => {
    const calls = stubFetch(groundedPayload());

    await gateway().generateText({ ...input, searchGrounding: true });

    expect(calls[0]?.tools).toEqual([{ google_search: {} }]);
    // El presupuesto de razonamiento sigue siendo el del esfuerzo: medido
    // contra el proveedor, buscar y razonar conviven en la misma peticion.
    const config = calls[0]?.generationConfig as Record<string, unknown>;
    expect(config.thinkingConfig).toEqual({ thinkingBudget: 8_192 });
  });

  it("no manda ninguna herramienta cuando la llamada no busca", async () => {
    const calls = stubFetch(groundedPayload());

    await gateway().generateText(input);

    expect(calls[0]?.tools).toBeUndefined();
  });

  it("devuelve las fuentes de la metadata, sin repetir una URL", async () => {
    stubFetch(groundedPayload());

    const result = await gateway().generateText({ ...input, searchGrounding: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.citations).toEqual([
      { url: "https://redirect.test/uno", title: "pipingrock.com" },
      { url: "https://redirect.test/dos", title: "ebay.com" },
    ]);
  });

  it("no inventa fuentes cuando el proveedor no reporto ninguna", async () => {
    stubFetch({
      candidates: [
        { content: { parts: [{ text: "Respondo de memoria." }] }, finishReason: "STOP" },
      ],
      responseId: "res_2",
      modelVersion: "modelo-de-prueba",
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    });

    const result = await gateway().generateText({ ...input, searchGrounding: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.citations).toEqual([]);
  });
});
