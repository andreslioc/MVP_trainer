/**
 * Recorte de la transcripcion por ventana de tiempo.
 *
 * Es la pieza que hace que el costo de analizar el chat crezca lineal con el
 * chat y no con el producto chat x transcripcion. Para saber si la asesora
 * respondio una pregunta hecha en el minuto 12 no hace falta mandarle las dos
 * horas de live: basta el tramo alrededor del minuto 12. Sin este recorte, seis
 * lotes contra una transcripcion de 40k tokens costarian 240k de entrada; con
 * el, cada linea se manda una vez mas un solape corto.
 */

export type TranscriptLine = {
  /** Segundo del live, tomado de la marca `[Xs]`. Nulo si la linea no la trae. */
  atSeconds: number | null;
  text: string;
};

/** `[123s]` al inicio de la linea, tal como la escriben Deepgram y Groq. */
const MARK = /^\[(\d+)s\]\s*/;

/**
 * Media anchura de la ventana con la que se BUSCA el desfase, antes de saber
 * cuanto vale.
 *
 * El chat marca el tiempo desde que arranco el live; la transcripcion, desde
 * que arranco la grabacion. No son el mismo instante: si se empezo a grabar
 * tres minutos tarde, cada respuesta esta 180 s ANTES en el audio de lo que su
 * pregunta sugiere, y una ventana que solo mira hacia adelante no la encuentra
 * jamas. Por eso el primer lote mira ancho y simetrico: no sabemos ni la
 * magnitud ni el signo.
 *
 * La compresion NO entra en esta cuenta. `compress.ts` pasa el audio a mono,
 * 16 kHz y opus, y nada mas: sin `silenceremove`, sin `-ss`, sin `atempo`. La
 * duracion se conserva, asi que la conversion no puede desfasar nada.
 */
export const CALIBRATION_WINDOW_S = 900;

/**
 * Media anchura de la ventana una vez medido el desfase.
 *
 * Ya no cubre el desfase —el centro de la ventana lo absorbe— sino la
 * dispersion: cuanto varia el rato que la asesora tarda en contestar respecto
 * de su propia mediana.
 */
export const ANSWER_SPREAD_S = 300;

export function parseTranscript(raw: string): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const mark = trimmed.match(MARK);
    lines.push({
      atSeconds: mark ? Number(mark[1]) : null,
      text: trimmed,
    });
  }
  return lines;
}

/** Hay al menos una marca de tiempo con la que anclar un recorte. */
export function hasMarks(lines: readonly TranscriptLine[]) {
  return lines.some((line) => line.atSeconds !== null);
}

/**
 * Devuelve las lineas dentro de `[fromS, toS]`.
 *
 * Las lineas sin marca heredan el segundo de la ultima que si la tenia: una
 * transcripcion mixta no debe perder los tramos intermedios.
 */
export function sliceByTime(lines: readonly TranscriptLine[], fromS: number, toS: number) {
  const kept: string[] = [];
  let current = 0;
  for (const line of lines) {
    if (line.atSeconds !== null) current = line.atSeconds;
    if (current >= fromS && current <= toS) kept.push(line.text);
  }
  return kept.join("\n");
}

/**
 * Margen del recorte aproximado, en segundos de live.
 *
 * Un 10% suena razonable hasta que el live dura dos horas y medias: ahi el
 * margen solo son veinte minutos de transcripcion extra por lote, y ocho lotes
 * mandan el doble del live entero. El tope absoluto es lo que mantiene el costo
 * acotado sin importar cuanto dure la grabacion.
 */
const FRACTION_MARGIN_S = 600;
const FRACTION_MARGIN_RATIO = 0.1;

/**
 * Recorte para transcripciones sin marcas —las pegadas a mano—, asumiendo que
 * el texto avanza a ritmo parejo con el live.
 *
 * Es una aproximacion y por eso lleva margen: preferimos mandar de mas a cortar
 * justo donde estaba la respuesta. Es tambien el camino caro, y existe solo
 * porque una transcripcion pegada a mano no trae de donde anclar.
 */
export function sliceByFraction(
  lines: readonly TranscriptLine[],
  fromS: number,
  toS: number,
  durationS: number,
) {
  if (durationS <= 0) return lines.map((line) => line.text).join("\n");
  const marginS = Math.min(FRACTION_MARGIN_S, durationS * FRACTION_MARGIN_RATIO);
  const margin = marginS / durationS;
  const from = Math.max(0, fromS / durationS - margin);
  const to = Math.min(1, toS / durationS + margin);
  const start = Math.floor(from * lines.length);
  const end = Math.ceil(to * lines.length);
  return lines
    .slice(start, end)
    .map((line) => line.text)
    .join("\n");
}
