import { describe, expect, it } from "vitest";

import {
  ANCHORED_BATCH_SIZE,
  batchQuestions,
  groupQuestions,
  MAX_BATCH_SPAN_S,
  parseChatLog,
} from "../../src/lib/chat-log.ts";

describe("parseo del chat", () => {
  it("descarta eventos de seguimiento, que no los escribio nadie", () => {
    const parsed = parseChatLog(
      [
        "[00:03:11] [FOLLOW] @nenchicordoba8 (nenchi)",
        "[00:03:59] @user2010856862781: De que cuidad se encuentran ?",
      ].join("\n"),
    );

    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0]?.text).toBe("De que cuidad se encuentran ?");
    expect(parsed.droppedNoise).toBe(1);
  });

  it("lee el segundo del live desde la marca de la linea", () => {
    const parsed = parseChatLog("[00:05:02] @martha: que precio tiene el maxcalm");
    expect(parsed.messages[0]?.atSeconds).toBe(302);
  });

  it("acepta marcas de minuto y segundo", () => {
    const parsed = parseChatLog("[05:02] @martha: que precio tiene el maxcalm");
    expect(parsed.messages[0]?.atSeconds).toBe(302);
  });

  it("descarta emojis sueltos y cortesias, que no preguntan nada", () => {
    const parsed = parseChatLog(
      [
        "[00:06:13] @martha: muchas gracias",
        "[00:06:39] @sara: 🥰🥰🥰🥰",
        "[00:07:03] @ana: hola",
      ].join("\n"),
    );

    expect(parsed.messages).toHaveLength(0);
    expect(parsed.droppedNoise).toBe(3);
  });

  it("conserva la pregunta cuando el saludo solo la precede", () => {
    const parsed = parseChatLog("[00:05:02] @martha: buenas tardes que precio tiene el maxcalm");
    expect(parsed.messages).toHaveLength(1);
  });

  it("conserva una pregunta sin signo de interrogacion", () => {
    const parsed = parseChatLog("[00:08:05] @ricardo: para q sirve el fenogreco y como se toma");
    expect(parsed.messages).toHaveLength(1);
  });
});

describe("agrupacion de preguntas repetidas", () => {
  it("colapsa la misma pregunta escrita distinto y cuenta cuantas veces la hicieron", () => {
    const { messages } = parseChatLog(
      [
        "[00:05:02] @a: Precio del Max calm porfa",
        "[00:06:39] @b: precio del max calm porfa!!",
        "[00:07:10] @c: PRECIO DEL MAX CALM PORFA 🙏",
      ].join("\n"),
    );

    const groups = groupQuestions(messages);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.askedCount).toBe(3);
  });

  it("ancla el grupo en la primera vez que se pregunto, no en la ultima", () => {
    const { messages } = parseChatLog(
      ["[00:10:00] @a: precio del omega", "[00:05:00] @b: precio del omega"].join("\n"),
    );

    const group = groupQuestions(messages)[0];
    expect(group?.atSeconds).toBe(300);
    expect(group?.occurrenceAtSeconds).toEqual([300, 600]);
  });

  it("no mezcla preguntas sobre productos distintos", () => {
    const { messages } = parseChatLog(
      ["[00:05:00] @a: precio del omega", "[00:06:00] @b: precio del fenogreco"].join("\n"),
    );

    expect(groupQuestions(messages)).toHaveLength(2);
  });
});

describe("troceado en lotes", () => {
  function chatOf(count: number, stepS: number) {
    return Array.from({ length: count }, (_value, index) => {
      const at = index * stepS;
      const stamp = `${String(Math.floor(at / 3600)).padStart(2, "0")}:${String(
        Math.floor((at % 3600) / 60),
      ).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`;
      return `[${stamp}] @viewer${index}: pregunta numero ${index} sobre el producto`;
    }).join("\n");
  }

  it("no deja ninguna pregunta fuera de algun lote", () => {
    const groups = groupQuestions(parseChatLog(chatOf(220, 20)).messages);
    const batches = batchQuestions(groups);

    expect(batches.flat()).toHaveLength(groups.length);
    expect(new Set(batches.flat().map((group) => group.text)).size).toBe(groups.length);
  });

  it("ningun lote pasa del tamano maximo", () => {
    const batches = batchQuestions(groupQuestions(parseChatLog(chatOf(220, 20)).messages));
    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(ANCHORED_BATCH_SIZE);
    }
  });

  it("acota el tramo de live que cada lote abarca, para acotar el recorte", () => {
    // Chat disperso: una pregunta cada cinco minutos durante seis horas.
    const batches = batchQuestions(groupQuestions(parseChatLog(chatOf(72, 300)).messages));
    for (const batch of batches) {
      const first = batch[0]?.atSeconds ?? 0;
      const last = batch[batch.length - 1]?.atSeconds ?? 0;
      expect(last - first).toBeLessThanOrEqual(MAX_BATCH_SPAN_S);
    }
  });

  it("las preguntas sin marca viajan aparte, no contaminan una ventana de tiempo", () => {
    const groups = groupQuestions(
      parseChatLog(["[00:05:00] @a: precio del omega", "@b: y el fenogreco cuanto vale"].join("\n"))
        .messages,
    );
    const batches = batchQuestions(groups);

    for (const batch of batches) {
      const anchored = batch.filter((group) => group.atSeconds !== null).length;
      expect(anchored === 0 || anchored === batch.length).toBe(true);
    }
  });
});

describe("orden de parseo y redaccion", () => {
  it("quita el handle numerico en vez de dejarlo pegado a la pregunta", () => {
    // @user605404570517 tiene 16 digitos: redactar ANTES de parsear lo vuelve
    // @user[telefono], el patron del handle no reconoce los corchetes y el
    // prefijo se queda dentro del texto de la pregunta.
    const parsed = parseChatLog("[00:05:00] @user605404570517: que precio del magnesio");

    expect(parsed.messages[0]?.text).toBe("que precio del magnesio");
    expect(parsed.messages[0]?.text.startsWith("@")).toBe(false);
  });

  it("agrupa la misma pregunta aunque los handles sean numericos y distintos", () => {
    const { messages } = parseChatLog(
      [
        "[00:05:00] @user605404570517: precio del magnesio",
        "[00:06:00] @user2010856862781: precio del magnesio",
      ].join("\n"),
    );

    expect(groupQuestions(messages)).toHaveLength(1);
  });
});
