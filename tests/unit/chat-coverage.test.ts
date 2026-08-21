import { describe, expect, it } from "vitest";

import type { ChatCoverageBatch } from "../../src/lib/ai/schemas.ts";
import type { StructuredOutputInput } from "../../src/lib/ai/structured.ts";
import { parseChatLog } from "../../src/lib/chat-log.ts";
import { collectChatCoverage } from "../../src/server/recordings/chat-coverage.ts";
import { NO_SON_PREGUNTAS, PREGUNTAS_REALES } from "../fixtures/chat-live.ts";

function chatOf(count: number, stepS = 20) {
  return Array.from({ length: count }, (_value, index) => {
    const at = index * stepS;
    const stamp = [Math.floor(at / 3600), Math.floor((at % 3600) / 60), at % 60]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
    return `[${stamp}] @viewer${index}: cuanto cuesta el producto numero ${index}`;
  }).join("\n");
}

function transcriptOf(count: number, stepS = 20) {
  return Array.from(
    { length: count },
    (_value, index) => `[${index * stepS}s] [Speaker 0] Eso vale ${index} mil pesos.`,
  ).join("\n");
}

/** El tramo de transcripcion que viajo en un prompt, sin el chat. */
function transcriptPart(prompt: string) {
  const head = "TRANSCRIPCION DEL TRAMO:\n";
  const start = prompt.indexOf(head) + head.length;
  const end = prompt.indexOf("\n\nMENSAJES DEL CHAT");
  return prompt.slice(start, end);
}

/**
 * Contesta todo lo que le pasen, y de paso registra que recibio cada lote para
 * poder afirmar propiedades de costo y de cobertura.
 */
function recordingGenerate() {
  const calls: Array<{ prompt: string; size: number }> = [];
  async function generate(input: StructuredOutputInput<ChatCoverageBatch>) {
    const prompt = input.messages.map((message) => message.content).join("\n");
    const size = Number(prompt.match(/numerados de 0 a (\d+)/)?.[1] ?? -1) + 1;
    calls.push({ prompt, size });
    return {
      ok: true as const,
      data: {
        value: {
          items: Array.from({ length: size }, (_value, index) => ({
            i: index,
            es_pregunta: true,
            answered: true,
            evidence_quote: "Eso vale 1 mil pesos.",
            at_seconds: 10,
          })),
        },
        repaired: false,
      },
    };
  }
  return { generate, calls };
}

const base = { advisorId: "asesora", promptId: "prompt", durationS: 4_400 };

describe("cobertura de chat", () => {
  it("cubre TODAS las preguntas, no las primeras que le quepan", async () => {
    const { generate } = recordingGenerate();
    const outcome = await collectChatCoverage(
      { ...base, chatLog: chatOf(220), transcript: transcriptOf(220) },
      generate,
    );

    expect(outcome.questionCount).toBe(220);
    expect(outcome.rows).toHaveLength(220);
    expect(outcome.batches).toBeGreaterThan(1);
    expect(outcome.failedBatches).toBe(0);
  });

  it("cada lote recibe solo su tramo de transcripcion, no el live entero", async () => {
    const { generate, calls } = recordingGenerate();
    await collectChatCoverage(
      { ...base, chatLog: chatOf(220), transcript: transcriptOf(220) },
      generate,
    );

    expect(calls.length).toBeGreaterThan(1);

    // La propiedad concreta: el primer lote cubre el arranque del live y no
    // puede estar viendo el final. Si la viera, no habria recorte.
    expect(calls[0]?.prompt).toContain("[0s] [Speaker 0]");
    expect(calls[0]?.prompt).not.toContain("[4380s] [Speaker 0]");

    // Y la agregada, medida SOLO sobre la transcripcion: mandarla entera en
    // cada lote costaria transcripcion x lotes. Con recorte cada linea viaja
    // una vez mas la ventana, muy por debajo de ese costo.
    const completa = transcriptOf(220).length;
    const enviada = calls.reduce((total, call) => total + transcriptPart(call.prompt).length, 0);
    expect(enviada).toBeLessThan(completa * calls.length * 0.5);
  });

  it("agrupa la repeticion en una fila con su conteo, y no en veinte filas", async () => {
    const { generate } = recordingGenerate();
    const chat = Array.from(
      { length: 20 },
      (_value, index) => `[00:0${index % 10}:00] @viewer${index}: cuanto vale el max calm`,
    ).join("\n");

    const outcome = await collectChatCoverage(
      { ...base, chatLog: chat, transcript: transcriptOf(10) },
      generate,
    );

    expect(outcome.rows).toHaveLength(1);
    expect(outcome.rows[0]?.askedCount).toBe(20);
  });

  it("guarda el texto que entro, nunca uno que el modelo haya reescrito", async () => {
    async function generate() {
      return {
        ok: true as const,
        data: {
          value: {
            items: [
              {
                i: 0,
                es_pregunta: true,
                answered: true,
                evidence_quote: "Vale 189 mil.",
                at_seconds: 10,
              },
            ],
          },
          repaired: false,
        },
      };
    }

    const outcome = await collectChatCoverage(
      {
        ...base,
        chatLog: "[00:05:00] @martha: que precio tiene el maxcalm",
        transcript: transcriptOf(5),
      },
      generate,
    );

    expect(outcome.rows[0]?.question).toBe("que precio tiene el maxcalm");
  });

  it("descarta un indice que no corresponde a ninguna pregunta entregada", async () => {
    async function generate() {
      return {
        ok: true as const,
        data: {
          value: {
            items: [
              {
                i: 0,
                es_pregunta: true,
                answered: true,
                evidence_quote: "Vale 189 mil.",
                at_seconds: 10,
              },
              {
                i: 99,
                es_pregunta: true,
                answered: true,
                evidence_quote: "Inventado.",
                at_seconds: 10,
              },
            ],
          },
          repaired: false,
        },
      };
    }

    const outcome = await collectChatCoverage(
      {
        ...base,
        chatLog: "[00:05:00] @martha: que precio tiene el maxcalm",
        transcript: transcriptOf(5),
      },
      generate,
    );

    expect(outcome.rows).toHaveLength(1);
  });

  it("no deja un segundo del video en una pregunta que no fue respondida", async () => {
    async function generate() {
      return {
        ok: true as const,
        data: {
          value: {
            items: [
              { i: 0, es_pregunta: true, answered: false, evidence_quote: null, at_seconds: 700 },
            ],
          },
          repaired: false,
        },
      };
    }

    const outcome = await collectChatCoverage(
      {
        ...base,
        chatLog: "[00:05:00] @martha: hacen envios a Cali",
        transcript: transcriptOf(5),
      },
      generate,
    );

    expect(outcome.rows[0]?.atSeconds).toBeNull();
  });

  it("redacta un telefono que el modelo trajo de vuelta en la cita", async () => {
    async function generate() {
      return {
        ok: true as const,
        data: {
          value: {
            items: [
              {
                i: 0,
                es_pregunta: true,
                answered: true,
                evidence_quote: "Escribeme al 3001234567 y te cuento.",
                at_seconds: 10,
              },
            ],
          },
          repaired: false,
        },
      };
    }

    const outcome = await collectChatCoverage(
      {
        ...base,
        chatLog: "[00:05:00] @martha: como hago el pedido",
        transcript: transcriptOf(5),
      },
      generate,
    );

    expect(outcome.rows[0]?.evidenceQuote).toBe("Escribeme al [telefono] y te cuento.");
  });

  it("un lote que falla no tumba los demas, y queda contado como cobertura parcial", async () => {
    let call = 0;
    async function generate() {
      call += 1;
      if (call === 1) {
        return {
          ok: false as const,
          error: { code: "AI_INVALID_OUTPUT" as const, message: "salida invalida" },
        };
      }
      return { ok: true as const, data: { value: { items: [] }, repaired: false } };
    }

    const outcome = await collectChatCoverage(
      { ...base, chatLog: chatOf(120), transcript: transcriptOf(120) },
      generate,
    );

    expect(outcome.failedBatches).toBe(1);
    expect(outcome.batches).toBeGreaterThan(1);
  });
});

describe("desfase entre el reloj del chat y el del audio", () => {
  // El chat marca desde que arranca el live; el audio, desde que arranca la
  // grabacion. Aqui se empezo a grabar 700 s tarde, asi que cada respuesta
  // aparece 700 s ANTES en el audio de lo que su pregunta sugiere.
  const DESFASE = 700;

  /** Solo responde si el tramo recibido contiene de verdad la linea buscada. */
  function honestGenerate() {
    async function generate(input: StructuredOutputInput<ChatCoverageBatch>) {
      const prompt = input.messages.map((message) => message.content).join("\n");
      const tramo = transcriptPart(prompt);
      const items = [];
      for (const linea of prompt.split("\n")) {
        const pregunta = /^(\d+) \[(\d+)s\]/.exec(linea);
        if (!pregunta) continue;
        const respuestaEn = Number(pregunta[2]) - DESFASE;
        // La respuesta solo se puede encontrar si su linea viajo en el tramo.
        if (respuestaEn < 0 || !tramo.includes(`[${respuestaEn}s]`)) continue;
        items.push({
          i: Number(pregunta[1]),
          es_pregunta: true,
          answered: true,
          evidence_quote: "Eso vale 1 mil pesos.",
          at_seconds: respuestaEn,
        });
      }
      return { ok: true as const, data: { value: { items }, repaired: false } };
    }
    return generate;
  }

  it("mide el desfase en vez de suponer que los relojes coinciden", async () => {
    const outcome = await collectChatCoverage(
      { ...base, chatLog: chatOf(220), transcript: transcriptOf(260) },
      honestGenerate(),
    );

    expect(outcome.lagS).not.toBeNull();
    expect(Math.abs((outcome.lagS ?? 0) + DESFASE)).toBeLessThanOrEqual(60);
  });

  it("encuentra las respuestas de los lotes siguientes, no solo las del primero", async () => {
    const outcome = await collectChatCoverage(
      { ...base, chatLog: chatOf(220), transcript: transcriptOf(260) },
      honestGenerate(),
    );

    // Se compara contra el total de preguntas, no contra las filas devueltas:
    // este generador solo devuelve las que pudo responder, asi que un ratio
    // sobre `rows` daria 100% siempre y no probaria nada.
    //
    // Las primeras 700 s del chat no tienen audio donde buscar —la grabacion
    // empezo despues—, asi que el techo alcanzable es ~84%. Sin corregir el
    // desfase, la ventana de cada lote apunta 700 s mas alla de donde esta la
    // respuesta y el resultado se queda por debajo de la mitad.
    const respondidas = outcome.rows.filter((row) => row.answered).length;
    expect(respondidas).toBeGreaterThan(outcome.questionCount * 0.75);
  });

  it("avisa cuando el chat llega mas lejos que el audio", async () => {
    const { generate } = recordingGenerate();
    const outcome = await collectChatCoverage(
      { ...base, durationS: 2_000, chatLog: chatOf(220), transcript: transcriptOf(100) },
      generate,
    );

    // El chat cubre 4.380 s y el audio dura 2.000: hay preguntas cuyo audio no
    // existe, y eso tiene que ser visible en vez de parecer culpa del analisis.
    expect(outcome.chatBeyondAudioS).toBeGreaterThan(2_000);
  });

  it("no mide un desfase con dos o tres datos: preferimos ventana ancha a centro equivocado", async () => {
    let call = 0;
    async function generate() {
      call += 1;
      return {
        ok: true as const,
        data: {
          value: {
            items:
              call === 1
                ? [
                    {
                      i: 0,
                      es_pregunta: true,
                      answered: true,
                      evidence_quote: "Vale.",
                      at_seconds: 10,
                    },
                  ]
                : [],
          },
          repaired: false,
        },
      };
    }

    const outcome = await collectChatCoverage(
      { ...base, chatLog: chatOf(220), transcript: transcriptOf(220) },
      generate,
    );

    expect(outcome.lagS).toBeNull();
  });
});

describe("mensajes que no son preguntas", () => {
  it("no los guarda, pero los cuenta", async () => {
    async function generate(input: StructuredOutputInput<ChatCoverageBatch>) {
      const prompt = input.messages.map((message) => message.content).join("\n");
      const size = Number(prompt.match(/numerados de 0 a (\d+)/)?.[1] ?? -1) + 1;
      return {
        ok: true as const,
        data: {
          value: {
            items: Array.from({ length: size }, (_value, index) => ({
              i: index,
              // El primero es pregunta; el resto, ruido.
              es_pregunta: index === 0,
              answered: false,
              evidence_quote: null,
              at_seconds: null,
            })),
          },
          repaired: false,
        },
      };
    }

    const outcome = await collectChatCoverage(
      {
        ...base,
        chatLog: [
          "[00:05:00] @a: que precio tiene el maxcalm",
          "[00:05:10] @b: Holi",
          "[00:05:20] @c: ya te escribi para adquirir el producto",
        ].join("\n"),
        transcript: transcriptOf(5),
      },
      generate,
    );

    expect(outcome.rows).toHaveLength(1);
    expect(outcome.rows[0]?.question).toBe("que precio tiene el maxcalm");
    expect(outcome.notQuestions).toBe(2);
    expect(outcome.questionCount).toBe(3);
  });
});

describe("mensajes reales de un live", () => {
  it("el filtro de codigo no descarta ninguna pregunta real, ni las elipticas", () => {
    // Es la mitad de la que mas duele equivocarse: lo que el codigo tira aqui
    // el modelo no lo llega a ver nunca. "precio???" y "valor" tienen que
    // sobrevivir al filtro barato para que el caro pueda clasificarlas.
    const chat = PREGUNTAS_REALES.map(
      (texto, index) => `[00:0${index % 10}:00] @viewer${index}: ${texto}`,
    ).join("\n");

    const parsed = parseChatLog(chat);
    const vistos = new Set(parsed.messages.map((message) => message.text));
    for (const pregunta of PREGUNTAS_REALES) {
      expect(vistos.has(pregunta)).toBe(true);
    }
  });

  it("el ruido llega al modelo para que lo clasifique, no se adivina en codigo", () => {
    // Salvo el saludo pelado, que el filtro barato ya reconoce sin gastar nada.
    const chat = NO_SON_PREGUNTAS.map(
      (texto, index) => `[00:0${index % 10}:00] @viewer${index}: ${texto}`,
    ).join("\n");

    const parsed = parseChatLog(chat);
    expect(parsed.messages.length).toBeGreaterThan(NO_SON_PREGUNTAS.length / 2);
  });
});
