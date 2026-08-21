/**
 * Linea de tiempo del chat de un simulacro de live.
 *
 * Es logica pura y sin navegador a proposito: el ritmo del chat es lo que
 * decide si el simulacro entrena algo, y una regla de ritmo que solo se puede
 * ver corriendo la camara no se puede probar.
 *
 * El relleno son frases reales de un live de Super Store, elegidas por
 * genericas: nada de nombres, telefonos ni handles de viewers, que son datos de
 * terceros y no tienen por que vivir en un repositorio.
 */

export type SimSpeed = "despacio" | "normal" | "rapido" | "aleatorio";

/**
 * Deja la pregunta nombrando el producto, si no lo nombraba ya.
 *
 * En un live real la clienta VE el producto en camara, asi que "precio???" se
 * entiende. En un simulacro no hay nada en camara y las preguntas vienen de
 * varias fichas mezcladas: "¿para que sirve?" a secas no se puede responder, y
 * medir la atencion con una pregunta imposible no mide nada.
 *
 * El producto va delante porque asi se escribe en un chat de verdad: "el
 * maxcalm para que sirve", "cal max en polvo", "gestavi tabletas cuanto vale".
 */
function withoutAccents(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Palabras del nombre que sirven para IDENTIFICARLO en un texto.
 *
 * Tres letras o menos no identifican nada: "de", "el", "kg" aparecen en
 * cualquier frase y darian por mencionado un producto que nadie nombro.
 */
function nameWords(productName: string) {
  return withoutAccents(productName)
    .split(/\s+/)
    .filter((word) => word.length > 3);
}

/**
 * Todas las palabras del nombre, para QUITARLO de un texto.
 *
 * Aqui si entran las cortas: "Max" tiene tres letras y dejarla puesta partia
 * "que precio tiene el max calm" en "Max Calm" / "que precio tiene el max",
 * repitiendo la mitad del nombre en el segundo mensaje.
 */
function allNameWords(productName: string) {
  return withoutAccents(productName)
    .split(/\s+/)
    .filter((word) => word.length >= 2);
}

/**
 * Parte una pregunta en dos mensajes seguidos, como escribe media clienta en un
 * live: primero el producto, en otro mensaje lo que quiere saber.
 *
 * En el chat real de un live esto pasa constantemente —"Que vale el omega 3",
 * y tres mensajes despues "Omega"— y obliga a relacionar dos lineas separadas
 * por ruido, que es mas dificil que leer una sola. Devuelve `null` cuando
 * partirla dejaria un pedazo que no dice nada.
 */
export function splitQuestion(text: string, productName: string): [string, string] | null {
  const words = allNameWords(productName);
  const resto = text
    .split(/\s+/)
    .filter((word) => {
      const plain = withoutAccents(word).replace(/[^\p{L}\p{N}]/gu, "");
      return plain.length > 0 && !words.includes(plain);
    })
    // Un "el" o un "de" colgando al final delata que se corto una frase.
    .filter((word, index, all) => !(index === all.length - 1 && withoutAccents(word).length <= 2))
    .join(" ")
    .trim();

  return resto.length < 3 ? null : [productName, resto];
}

export function questionForChat(text: string, productName: string) {
  const normalized = withoutAccents(text);
  const mentions = nameWords(productName).some((word) => normalized.includes(word));
  return mentions ? text : `${productName} ${text}`;
}

export type SimLine = {
  /** Milisegundo del simulacro en que aparece. */
  atMs: number;
  author: string;
  text: string;
  /** No nulo cuando la linea es parte de una pregunta inyectada a proposito. */
  questionId: string | null;
  /**
   * La linea completa la pregunta: es el instante desde el cual se puede
   * responder, y por lo tanto el que cuenta para medir la reaccion.
   *
   * Cuando una pregunta llega partida en dos mensajes, la primera pieza no
   * completa nada: "el maxcalm" a secas no se puede contestar.
   */
  completesQuestion: boolean;
};

/**
 * Relleno: lo que en un live real no pregunta nada. Saludos, reacciones,
 * avisos de llegada, comentarios entre viewers y testimonios.
 */
export const FILLER_LINES: readonly string[] = Object.freeze([
  "hola",
  "holaaa",
  "buenas tardes",
  "buenas",
  "Acabo de llegar",
  "Entré recién al en vivo",
  "gracias",
  "muchas gracias",
  "okey gracias",
  "🥰🥰🥰🥰",
  "❤️❤️",
  "😱😱😱",
  "listo",
  "si",
  "dale",
  "bendiciones",
  "saludos desde Cali",
  "saludos desde Medellín",
  "amén",
  "que rico",
  "me encanta",
  "ya te escribo",
  "me interesa",
  "Te voy a escribir",
  "yo ya compré y es excelente",
  "a mí me funcionó muy bien",
  "el mío sabe delicioso",
  "estoy interesada",
  "ahí te escribo al interno",
  "chao, bendiciones",
  "se me fue el internet",
  "no te escucho bien",
  "sube el volumen",
  "hermosa",
  "que linda",
  "jajaja",
  "presente",
]);

/** Handles con forma de TikTok, inventados: no son de personas reales. */
export const FILLER_HANDLES: readonly string[] = Object.freeze([
  "@user2010856",
  "@lina.maria",
  "@martha_reyes",
  "@dansanros",
  "@juanchoo225",
  "@laura_c011",
  "@pitty.z",
  "@kaomy73",
  "@user6054045",
  "@alenanails",
  "@claudiab",
  "@jhon.villota",
  "@saishg",
  "@rosaisabel25",
  "@yuli.leon",
  "@marce41038",
]);

/** Eventos que TikTok muestra en el chat y que nadie escribio. */
export const FILLER_EVENTS: readonly string[] = Object.freeze(["se unió", "empezó a seguirte"]);

/** Milisegundos entre lineas para cada velocidad. */
const CADENCE_MS: Record<Exclude<SimSpeed, "aleatorio">, number> = {
  despacio: 4_000,
  normal: 2_000,
  rapido: 900,
};

/**
 * Base del ritmo aleatorio y cuanto puede estirarse o comprimirse.
 *
 * Es el predeterminado porque un chat real no llega a ritmo constante: llega en
 * rachas, con silencios en medio. Un intervalo fijo se siente como un metronomo
 * y se vuelve facil de anticipar, que es lo contrario de entrenar atencion.
 */
const RANDOM_BASE_MS = 1_600;
const RANDOM_MIN_FACTOR = 0.2;
const RANDOM_MAX_FACTOR = 2.6;

/** Cuanto se espera antes de la primera pregunta, para que se acomode. */
const WARMUP_MS = 8_000;
/** Cuanto se le deja para responder la ultima. */
const COOLDOWN_MS = 12_000;

function nextInterval(speed: SimSpeed, random: () => number) {
  if (speed !== "aleatorio") return CADENCE_MS[speed];
  const factor = RANDOM_MIN_FACTOR + random() * (RANDOM_MAX_FACTOR - RANDOM_MIN_FACTOR);
  return Math.round(RANDOM_BASE_MS * factor);
}

/**
 * Reparte las preguntas a lo largo del simulacro.
 *
 * Ni al principio ni al final: la primera espera a que la asesora se acomode y
 * la ultima deja tiempo de responder, porque una pregunta en el ultimo segundo
 * mide el corte del cronometro y no su atencion.
 */
function questionMoments(count: number, durationMs: number) {
  // Sin preguntas no hay momento que reservar. Devolver uno igual dejaba un
  // hueco de relleno en medio de un chat que no tenia nada que proteger.
  if (count <= 0) return [];
  const from = Math.min(WARMUP_MS, durationMs / 4);
  const to = Math.max(from, durationMs - Math.min(COOLDOWN_MS, durationMs / 3));
  if (count <= 1) return [Math.round((from + to) / 2)];
  const step = (to - from) / (count - 1);
  return Array.from({ length: count }, (_value, index) => Math.round(from + step * index));
}

/** Una de cada tres preguntas llega partida. Suficiente para que no se anticipe. */
const SPLIT_RATE = 0.34;
/** Cuanto separa las dos piezas de una pregunta partida. */
const SPLIT_GAP_MIN_MS = 1_500;
const SPLIT_GAP_MAX_MS = 3_500;

export type TimelineInput = {
  questions: ReadonlyArray<{ id: string; text: string; productName?: string }>;
  durationMs: number;
  speed: SimSpeed;
  /** Inyectable para que las pruebas no dependan del azar. */
  random?: () => number;
  filler?: readonly string[];
  handles?: readonly string[];
};

export function buildTimeline(input: TimelineInput): SimLine[] {
  const random = input.random ?? Math.random;
  const filler = input.filler ?? FILLER_LINES;
  const handles = input.handles ?? FILLER_HANDLES;
  const moments = questionMoments(input.questions.length, input.durationMs);

  const lines: SimLine[] = [];
  input.questions.forEach((question, index) => {
    const at = moments[index] ?? 0;
    // La misma persona en las dos piezas: dos handles distintos serian dos
    // personas y no habria nada que relacionar.
    const author = handles[Math.floor(random() * handles.length)] ?? handles[0] ?? "@viewer";
    const productName = question.productName ?? "";
    const pieces =
      productName && random() < SPLIT_RATE ? splitQuestion(question.text, productName) : null;

    if (pieces === null) {
      lines.push({
        atMs: at,
        author,
        text: questionForChat(question.text, productName),
        questionId: question.id,
        completesQuestion: true,
      });
      return;
    }

    const gap = Math.round(SPLIT_GAP_MIN_MS + random() * (SPLIT_GAP_MAX_MS - SPLIT_GAP_MIN_MS));
    // La segunda pieza cae en el momento previsto porque es la que hace la
    // pregunta respondible; la primera se adelanta.
    lines.push({
      atMs: Math.max(0, at - gap),
      author,
      text: pieces[0],
      questionId: question.id,
      completesQuestion: false,
    });
    lines.push({
      atMs: at,
      author,
      text: pieces[1],
      questionId: question.id,
      completesQuestion: true,
    });
  });

  let at = 0;
  let index = 0;
  while (at < input.durationMs) {
    at += nextInterval(input.speed, random);
    if (at >= input.durationMs) break;
    // No se pisa una pregunta: si cae junto a una, se corre. Una pregunta
    // tapada por relleno en el mismo instante no se pudo haber leido.
    if (lines.some((line) => line.questionId !== null && Math.abs(line.atMs - at) < 600)) continue;
    const text = filler[index % filler.length] ?? "hola";
    index += 1;
    lines.push({
      atMs: at,
      author: handles[Math.floor(random() * handles.length)] ?? handles[0] ?? "@viewer",
      text,
      questionId: null,
      completesQuestion: false,
    });
  }

  return lines.sort((a, b) => a.atMs - b.atMs);
}

/** El chat del simulacro en el formato que `parseChatLog` ya sabe leer. */
export function timelineToChatLog(lines: readonly SimLine[]) {
  return lines
    .map((line) => {
      const total = Math.floor(line.atMs / 1000);
      const stamp = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
        .map((part) => String(part).padStart(2, "0"))
        .join(":");
      return `[${stamp}] ${line.author}: ${line.text}`;
    })
    .join("\n");
}
