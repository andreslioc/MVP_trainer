/**
 * Parseo, limpieza y agrupacion del chat de un live, sin tocar el modelo.
 *
 * El chat de TikTok llega con mucho relleno: eventos de seguimiento, emojis
 * sueltos, saludos y la misma pregunta repetida por veinte personas. Todo eso
 * se puede quitar con reglas deterministas, y quitarlo aqui es gratis mientras
 * que quitarlo en el prompt cuesta tokens de entrada y atencion del modelo.
 *
 * La agrupacion no es solo ahorro: veinte "cuanto vale el maxcalm" son UNA
 * pregunta preguntada veinte veces, y esa es la forma en que la asesora
 * necesita leerlo.
 */

/** Un mensaje de viewer, ya separado de su marca de tiempo. */
export type ChatMessage = {
  /** Segundo del live en que se escribio, si la linea traia marca. */
  atSeconds: number | null;
  text: string;
};

/** Una pregunta unica y cuantas personas la hicieron. */
export type ChatQuestionGroup = {
  text: string;
  /** Primera vez que se pregunto. Ancla la ventana de transcripcion. */
  atSeconds: number | null;
  askedCount: number;
};

export type ParsedChatLog = {
  messages: ChatMessage[];
  /** Lineas descartadas por ser eventos, reacciones o saludos. */
  droppedNoise: number;
};

/** `[HH:MM:SS]` o `[MM:SS]` al inicio de la linea. */
const TIMESTAMP = /^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*/;

/** Lo que sigue a la marca cuando la linea es un evento y no un mensaje. */
const EVENT = /^\[[A-Z_]+\]/;

/** `@handle:` al inicio de lo que queda tras la marca. */
const HANDLE = /^@[\w.-]+\s*:\s*/;

/**
 * Todo lo que no es letra ni numero ni espacio: emojis, banderas, simbolos y
 * los modificadores de tono de piel, que son puntos de codigo aparte.
 */
const NON_TEXT = /[^\p{L}\p{N}\s]/gu;

/**
 * Mensajes que son unicamente cortesia o reaccion. Se comparan contra el texto
 * completo normalizado, nunca como subcadena: "hola que precio tiene el omega"
 * tiene que sobrevivir.
 */
const PLEASANTRIES = new Set([
  "hola",
  "holaa",
  "holis",
  "buenas",
  "buenos dias",
  "buenas tardes",
  "buenas noches",
  "gracias",
  "muchas gracias",
  "mil gracias",
  "graciass",
  "ok",
  "oka",
  "okey",
  "listo",
  "si",
  "sii",
  "no",
  "nooo",
  "claro",
  "dale",
  "bueno",
  "ya",
  "amen",
  "bendiciones",
  "saludos",
  "excelente",
  "hermoso",
  "hermosa",
  "lindo",
  "linda",
  "wow",
  "jaja",
  "jajaja",
  "presente",
  "aqui",
  "por favor",
  "porfa",
  "bien",
  "genial",
  "felicitaciones",
  "chao",
  "adios",
  "hasta luego",
  "buen dia",
  "que rico",
  "delicioso",
  "me encanta",
  "top",
]);

/** Sin acentos, sin emojis, sin puntuacion, en minusculas y sin espacios dobles. */
function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(NON_TEXT, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSeconds(match: RegExpMatchArray) {
  const [, first, second, third] = match;
  // Con tres grupos es HH:MM:SS; con dos, MM:SS.
  return third === undefined
    ? Number(first) * 60 + Number(second)
    : Number(first) * 3600 + Number(second) * 60 + Number(third);
}

/**
 * Convierte el chat crudo en mensajes de viewer, descartando el ruido que no
 * puede contener una pregunta.
 */
export function parseChatLog(raw: string): ParsedChatLog {
  const messages: ChatMessage[] = [];
  let droppedNoise = 0;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const stamp = trimmed.match(TIMESTAMP);
    const atSeconds = stamp ? toSeconds(stamp) : null;
    const rest = stamp ? trimmed.slice(stamp[0].length) : trimmed;

    // `[FOLLOW]`, `[SHARE]`, `[GIFT]`, `[LIKE]`: no los escribio nadie.
    if (EVENT.test(rest)) {
      droppedNoise += 1;
      continue;
    }

    const text = rest.replace(HANDLE, "").trim();
    const normalized = normalize(text);

    // Sin letras ni numeros solo quedan emojis, y un emoji no pregunta nada.
    // Menos de tres caracteres tampoco alcanza para una pregunta.
    if (normalized.length < 3 || PLEASANTRIES.has(normalized)) {
      droppedNoise += 1;
      continue;
    }

    messages.push({ atSeconds, text });
  }

  return { messages, droppedNoise };
}

/**
 * Agrupa mensajes identicos salvo acentos, emojis y puntuacion.
 *
 * Representante: el texto mas largo del grupo, porque es el que mas contexto
 * conserva. Ancla: el segundo mas temprano, porque la respuesta de la asesora
 * viene despues de la primera vez que se pregunto, no de la ultima.
 */
export function groupQuestions(messages: readonly ChatMessage[]): ChatQuestionGroup[] {
  const groups = new Map<string, ChatQuestionGroup>();

  for (const message of messages) {
    const key = normalize(message.text);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { text: message.text, atSeconds: message.atSeconds, askedCount: 1 });
      continue;
    }
    existing.askedCount += 1;
    if (message.text.length > existing.text.length) existing.text = message.text;
    if (
      message.atSeconds !== null &&
      (existing.atSeconds === null || message.atSeconds < existing.atSeconds)
    ) {
      existing.atSeconds = message.atSeconds;
    }
  }

  // Orden cronologico: es como la asesora revisa el live, y mantiene cada lote
  // dentro de una ventana de tiempo estrecha.
  return [...groups.values()].sort((a, b) => (a.atSeconds ?? 0) - (b.atSeconds ?? 0));
}

/**
 * Cuantas preguntas van en un lote cuando el chat trae marcas de tiempo.
 *
 * Cuarenta es lo que un modelo pequeno sostiene sin empezar a saltarse
 * entradas, que es exactamente el fallo que este troceado existe para evitar.
 */
export const ANCHORED_BATCH_SIZE = 40;

/**
 * Sin marcas no hay recorte posible y cada lote arrastra la transcripcion
 * entera, asi que el lote se hace grande a proposito: el costo lo manda el
 * numero de lotes, no su tamano.
 */
export const UNANCHORED_BATCH_SIZE = 150;

/**
 * Un lote no abarca mas de veinte minutos de live. Acota el tramo de
 * transcripcion que cada lote arrastra cuando el chat viene disperso.
 */
export const MAX_BATCH_SPAN_S = 1_200;

/**
 * Parte las preguntas en lotes cronologicos y acotados en tiempo.
 *
 * Las que no traen marca no se pueden anclar a ningun tramo, asi que viajan
 * juntas al final en lotes grandes.
 */
export function batchQuestions(groups: readonly ChatQuestionGroup[]) {
  const anchored = groups.filter((group) => group.atSeconds !== null);
  const unanchored = groups.filter((group) => group.atSeconds === null);
  const batches: ChatQuestionGroup[][] = [];

  let current: ChatQuestionGroup[] = [];
  for (const group of anchored) {
    const span = current.length === 0 ? 0 : (group.atSeconds ?? 0) - (current[0].atSeconds ?? 0);
    if (current.length >= ANCHORED_BATCH_SIZE || span > MAX_BATCH_SPAN_S) {
      batches.push(current);
      current = [];
    }
    current.push(group);
  }
  if (current.length > 0) batches.push(current);

  for (let index = 0; index < unanchored.length; index += UNANCHORED_BATCH_SIZE) {
    batches.push(unanchored.slice(index, index + UNANCHORED_BATCH_SIZE));
  }

  return batches;
}
