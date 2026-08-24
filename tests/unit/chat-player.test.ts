import { describe, expect, it } from "vitest";

import {
  buildTimeline,
  FILLER_LINES,
  questionForChat,
  type SimSpeed,
  splitQuestion,
  timelineToChatLog,
} from "../../src/lib/simulator/chat-player.ts";
import { parseChatLog } from "../../src/lib/chat-log.ts";

/** Azar determinista: las pruebas no pueden depender de Math.random. */
function seeded(seed = 1) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

const questions = [
  { id: "q1", text: "a como la creatina" },
  { id: "q2", text: "sirve para bajar de peso" },
  { id: "q3", text: "una embarazada lo puede tomar" },
  { id: "q4", text: "es original" },
];

const CINCO_MIN = 300_000;

describe("linea de tiempo del chat simulado", () => {
  it("inyecta todas las preguntas pedidas, ni una menos", () => {
    const lines = buildTimeline({
      questions,
      durationMs: CINCO_MIN,
      speed: "normal",
      random: seeded(),
    });

    const inyectadas = lines.filter((line) => line.completesQuestion);
    expect(inyectadas).toHaveLength(4);
    expect(new Set(inyectadas.map((line) => line.questionId)).size).toBe(4);
  });

  it("ninguna pregunta cae en el arranque ni en el ultimo segundo", () => {
    // Una pregunta al final mide el corte del cronometro, no la atencion.
    const lines = buildTimeline({
      questions,
      durationMs: CINCO_MIN,
      speed: "normal",
      random: seeded(),
    });

    for (const line of lines.filter((item) => item.completesQuestion)) {
      expect(line.atMs).toBeGreaterThanOrEqual(8_000);
      expect(line.atMs).toBeLessThanOrEqual(CINCO_MIN - 12_000);
    }
  });

  it("deja aire alrededor de cada pregunta para que se pueda leer", () => {
    const lines = buildTimeline({
      questions,
      durationMs: CINCO_MIN,
      speed: "rapido",
      random: seeded(),
    });
    const momentos = lines.filter((line) => line.questionId !== null).map((line) => line.atMs);

    for (const line of lines.filter((item) => item.questionId === null)) {
      for (const momento of momentos) {
        expect(Math.abs(line.atMs - momento)).toBeGreaterThanOrEqual(600);
      }
    }
  });

  it("sale en orden cronologico", () => {
    const lines = buildTimeline({
      questions,
      durationMs: CINCO_MIN,
      speed: "aleatorio",
      random: seeded(),
    });

    for (let index = 1; index < lines.length; index += 1) {
      expect(lines[index]?.atMs).toBeGreaterThanOrEqual(lines[index - 1]?.atMs ?? 0);
    }
  });

  it("cada velocidad trae mas relleno que la anterior", () => {
    const cuenta = (speed: SimSpeed) =>
      buildTimeline({ questions, durationMs: CINCO_MIN, speed, random: seeded() }).filter(
        (line) => line.questionId === null,
      ).length;

    expect(cuenta("normal")).toBeGreaterThan(cuenta("despacio"));
    expect(cuenta("rapido")).toBeGreaterThan(cuenta("normal"));
  });

  it("el aleatorio llega en rachas, no a ritmo de metronomo", () => {
    // Es el predeterminado justamente por esto: un intervalo constante se
    // anticipa y deja de entrenar atencion.
    const lines = buildTimeline({
      questions,
      durationMs: CINCO_MIN,
      speed: "aleatorio",
      random: seeded(),
    });
    const relleno = lines.filter((line) => line.questionId === null);
    const huecos = relleno
      .slice(1)
      .map((line, index) => line.atMs - (relleno[index]?.atMs ?? 0))
      .filter((hueco) => hueco > 0);

    expect(new Set(huecos).size).toBeGreaterThan(5);
  });

  it("con velocidad fija el hueco es siempre el mismo", () => {
    const lines = buildTimeline({
      questions: [],
      durationMs: 60_000,
      speed: "despacio",
      random: seeded(),
    });
    const huecos = lines.slice(1).map((line, index) => line.atMs - (lines[index]?.atMs ?? 0));

    expect(new Set(huecos)).toEqual(new Set([4_000]));
  });

  it("el relleno no pregunta nada: sale del filtro de ruido", () => {
    // Si una linea de relleno fuera una pregunta, el simulacro estaria midiendo
    // atencion sobre preguntas que nadie inyecto.
    for (const linea of FILLER_LINES) {
      expect(linea).not.toMatch(/precio|cuanto|vale|cuesta|sirve|donde|como se toma/i);
    }
  });
});

describe("el chat simulado se lee con el mismo parser que un live real", () => {
  it("produce el formato que parseChatLog entiende", () => {
    const lines = buildTimeline({
      questions,
      durationMs: CINCO_MIN,
      speed: "normal",
      random: seeded(),
    });
    const parsed = parseChatLog(timelineToChatLog(lines));

    // Las cuatro preguntas tienen que sobrevivir al filtro de ruido.
    const textos = new Set(parsed.messages.map((message) => message.text));
    for (const question of questions) {
      expect(textos.has(question.text)).toBe(true);
    }
  });

  it("las marcas de tiempo coinciden con el segundo del simulacro", () => {
    const log = timelineToChatLog([
      {
        atMs: 8_000,
        author: "@user2010856",
        text: "a como la creatina",
        questionId: "q1",
        completesQuestion: true,
      },
      {
        atMs: 125_400,
        author: "@lina.maria",
        text: "hola",
        questionId: null,
        completesQuestion: false,
      },
    ]);

    expect(log.split("\n")[0]).toBe("[00:00:08] @user2010856: a como la creatina");
    expect(log.split("\n")[1]).toBe("[00:02:05] @lina.maria: hola");
  });
});

describe("la pregunta nombra el producto", () => {
  it("agrega el producto cuando la pregunta no lo dice", () => {
    // "¿Para que sirve?" a secas no se puede responder: en el simulacro no hay
    // nada en camara que diga de que ficha se habla, y las preguntas vienen de
    // varias fichas mezcladas.
    expect(questionForChat("¿Para qué sirve?", "Max Calm")).toBe("Max Calm ¿Para qué sirve?");
    expect(questionForChat("precio???", "Creatina monohidratada")).toBe(
      "Creatina monohidratada precio???",
    );
  });

  it("no lo repite si la pregunta ya lo nombraba", () => {
    expect(questionForChat("que precio tiene el max calm", "Max Calm")).toBe(
      "que precio tiene el max calm",
    );
  });

  it("reconoce el producto escrito sin acentos o en otra caja", () => {
    expect(questionForChat("para que sirve la CREATINA", "Creatina monohidratada")).toBe(
      "para que sirve la CREATINA",
    );
    expect(questionForChat("el magnesio a como", "Magnesio bisglicinato")).toBe(
      "el magnesio a como",
    );
  });

  it("no se conforma con una palabra corta del nombre", () => {
    // "de" o "kg" aparecen en cualquier texto y no identifican nada.
    expect(questionForChat("cuanto vale de eso", "Omega 3 de 90 capsulas")).toBe(
      "Omega 3 de 90 capsulas cuanto vale de eso",
    );
  });
});

describe("preguntas partidas en dos mensajes", () => {
  const conProducto = [
    { id: "q1", text: "que precio tiene el max calm", productName: "Max Calm" },
    { id: "q2", text: "para que sirve la creatina", productName: "Creatina monohidratada" },
    { id: "q3", text: "el magnesio a como", productName: "Magnesio bisglicinato" },
    { id: "q4", text: "sirve el omega para el colesterol", productName: "Omega 3" },
  ];

  it("parte dejando el producto en un mensaje y la duda en el siguiente", () => {
    expect(splitQuestion("que precio tiene el max calm", "Max Calm")).toEqual([
      "Max Calm",
      "que precio tiene",
    ]);
    // El "la" colgando se cae: delata que se corto una frase a la mitad.
    expect(splitQuestion("para que sirve la creatina", "Creatina monohidratada")).toEqual([
      "Creatina monohidratada",
      "para que sirve",
    ]);
  });

  it("no parte si lo que queda no dice nada", () => {
    // "Max Calm" / "el" no es una pregunta, es una frase cortada.
    expect(splitQuestion("el max calm", "Max Calm")).toBeNull();
    expect(splitQuestion("maxcalm", "Maxcalm")).toBeNull();
  });

  it("las dos piezas vienen de la misma persona", () => {
    // Dos handles distintos serian dos personas y no habria nada que relacionar.
    const lines = buildTimeline({
      questions: conProducto,
      durationMs: CINCO_MIN,
      speed: "normal",
      random: seeded(5),
    });

    for (const id of conProducto.map((question) => question.id)) {
      const piezas = lines.filter((line) => line.questionId === id);
      expect(new Set(piezas.map((line) => line.author)).size).toBe(1);
    }
  });

  it("cada pregunta tiene exactamente una linea que la completa", () => {
    const lines = buildTimeline({
      questions: conProducto,
      durationMs: CINCO_MIN,
      speed: "normal",
      random: seeded(5),
    });

    for (const id of conProducto.map((question) => question.id)) {
      const completan = lines.filter((line) => line.questionId === id && line.completesQuestion);
      expect(completan).toHaveLength(1);
    }
  });

  it("la primera pieza va antes de la que completa", () => {
    const lines = buildTimeline({
      questions: conProducto,
      durationMs: CINCO_MIN,
      speed: "normal",
      random: seeded(5),
    });

    for (const id of conProducto.map((question) => question.id)) {
      const piezas = lines.filter((line) => line.questionId === id);
      if (piezas.length < 2) continue;
      const completa = piezas.find((line) => line.completesQuestion);
      const previa = piezas.find((line) => !line.completesQuestion);
      expect(previa?.atMs).toBeLessThan(completa?.atMs ?? 0);
    }
  });

  it("hay relleno entre las dos piezas: eso es lo que cuesta relacionar", () => {
    const lines = buildTimeline({
      questions: conProducto,
      durationMs: CINCO_MIN,
      speed: "rapido",
      random: seeded(5),
    });
    const partidas = conProducto
      .map((question) => lines.filter((line) => line.questionId === question.id))
      .filter((piezas) => piezas.length === 2);

    // Con al menos una partida, entre sus piezas tiene que caber ruido.
    expect(partidas.length).toBeGreaterThan(0);
    const [primera, segunda] = partidas[0] ?? [];
    const enMedio = lines.filter(
      (line) =>
        line.questionId === null &&
        line.atMs > (primera?.atMs ?? 0) &&
        line.atMs < (segunda?.atMs ?? 0),
    );
    expect(enMedio.length).toBeGreaterThan(0);
  });
});

describe("la cuenta regresiva y el arranque", () => {
  it("ninguna pregunta cae en los primeros segundos", () => {
    // La cuenta regresiva son 5 s y el calentamiento del guion otros 8: entre
    // los dos, la asesora tiene margen para acomodarse antes de la primera.
    const lines = buildTimeline({
      questions,
      durationMs: 60_000,
      speed: "rapido",
      random: seeded(),
    });

    const primera = lines.find((line) => line.completesQuestion);
    expect(primera?.atMs ?? 0).toBeGreaterThanOrEqual(8_000);
  });

  it("el reloj del chat empieza en cero, no en la cuenta regresiva", () => {
    // El chat se pinta contra el tiempo transcurrido desde que arranca, que es
    // el mismo instante en que arranca la grabacion. Si la linea de tiempo
    // arrancara en 5, las marcas quedarian corridas contra la transcripcion.
    const lines = buildTimeline({
      questions: [],
      durationMs: 30_000,
      speed: "normal",
      random: seeded(),
    });

    expect(lines[0]?.atMs).toBeLessThanOrEqual(2_000);
  });
});
