/**
 * Cobertura de chat: que pregunto la audiencia y que quedo sin responder.
 *
 * Corre en llamadas propias, una por lote, en vez de colgarse del analisis de
 * la transcripcion. El motivo esta documentado en el prompt: compartiendo
 * llamada, un live de 307 mensajes devolvia 4 filas.
 *
 * La forma del costo es lo que gobierna este archivo. Cada lote lleva SOLO el
 * tramo de transcripcion donde puede estar la respuesta, no el live entero, asi
 * que la transcripcion se manda una vez repartida entre lotes y no una vez por
 * lote. El resultado crece lineal con el chat: el triple de comentarios cuesta
 * el triple de tokens de chat, y los mismos de transcripcion.
 */

import { AI_PROVIDER } from "../../lib/ai/config.ts";
import { buildChatCoveragePrompt } from "../../lib/ai/prompts/chat-coverage.ts";
import { hasSubstance, redactPii } from "../../lib/ai/prompts/analyze-transcript.ts";
import { type ChatCoverageBatch, chatCoverageBatchSchema } from "../../lib/ai/schemas.ts";
import type { StructuredOutputInput, StructuredOutputResult } from "../../lib/ai/structured.ts";
import {
  batchQuestions,
  type ChatQuestionGroup,
  groupQuestions,
  parseChatLog,
} from "../../lib/chat-log.ts";
import { mapWithConcurrency } from "../../lib/concurrency.ts";
import { logFailure } from "../../lib/log.ts";
import {
  ANSWER_SPREAD_S,
  CALIBRATION_WINDOW_S,
  hasMarks,
  parseTranscript,
  sliceByFraction,
  sliceByTime,
} from "../../lib/transcript.ts";

type GenerateBatch = (
  input: StructuredOutputInput<ChatCoverageBatch>,
) => Promise<StructuredOutputResult<ChatCoverageBatch>>;

export type ChatCoverageRow = {
  question: string;
  answered: boolean;
  evidenceQuote: string | null;
  atSeconds: number | null;
  askedCount: number;
};

export type ChatCoverageOutcome = {
  rows: ChatCoverageRow[];
  /** Mensajes que el filtro de codigo quito antes de gastar un token. */
  droppedNoise: number;
  /** Mensajes distintos tras agrupar repeticiones, antes de clasificar. */
  questionCount: number;
  /**
   * Mensajes que el modelo descarto por no ser preguntas: saludos, testimonios,
   * intenciones de compra y respuestas de un viewer a otro. Se cuentan y no se
   * guardan, porque una lista de "sin responder" llena de "Holi" y "me
   * interesa" deja de significar lo que dice que significa.
   */
  notQuestions: number;
  batches: number;
  /** Lotes que fallaron. Mayor que cero significa cobertura PARCIAL. */
  failedBatches: number;
  /**
   * Desfase medido entre el reloj del chat y el del audio, en segundos.
   * Positivo: las respuestas aparecen mas tarde en el audio de lo que su
   * pregunta sugiere. Nulo cuando no hubo con que medirlo.
   */
  lagS: number | null;
  /**
   * Diferencia entre lo que dura el chat y lo que dura el audio. Si es grande,
   * la grabacion no cubre el live entero y hay preguntas que NUNCA podran
   * encontrarse respondidas porque su audio no existe.
   */
  chatBeyondAudioS: number | null;
};

export type ChatCoverageInput = {
  advisorId: string;
  promptId: string;
  chatLog: string;
  transcript: string;
  durationS: number | null;
  /**
   * Los dos relojes arrancan juntos y no hay desfase que medir.
   *
   * Lo declara el simulacro, donde el chat y la grabacion nacen en la misma
   * pagina y en el mismo instante. Con eso se salta el lote de calibracion —no
   * hay nada que calibrar— y la regla de causalidad se aplica desde el primer
   * lote, que es justo donde hacia falta.
   */
  clocksAligned?: boolean;
};

/**
 * Cuanto puede adelantarse una respuesta a su pregunta sin ser imposible.
 *
 * Cero seria lo correcto en teoria, pero las marcas de una transcripcion no son
 * exactas: un segmento suele empezar un instante antes de la primera palabra, y
 * la asesora puede arrancar a hablar mientras la pregunta termina de aparecer.
 * Mas alla de esto no hay margen que valga: es una respuesta que ocurrio antes
 * de que existiera la pregunta.
 */
const MAX_ADELANTO_S = 3;

/**
 * Cuantos tokens de salida necesita un lote. Cada entrada son cuatro campos
 * cortos mas una cita de quince palabras como maximo; 120 por entrada deja
 * margen y sigue muy por debajo de lo que el lote completo podria pedir.
 */
function batchMaxTokens(size: number) {
  return Math.min(8_000, 1_000 + size * 120);
}

/**
 * El tramo de transcripcion donde puede estar la respuesta a este lote.
 *
 * `lagS` desplaza el centro de la ventana. Sin el, un audio que empezo tarde
 * hace que TODAS las respuestas caigan fuera del tramo y el live entero salga
 * como "sin responder" — un fallo que se ve igual que una asesora que no
 * contesto nada, y esa es la parte peligrosa.
 */
function windowFor(batch: readonly ChatQuestionGroup[], lagS: number | null) {
  const marks = batch.map((group) => group.atSeconds).filter((at): at is number => at !== null);
  if (marks.length === 0) return null;
  const spread = lagS === null ? CALIBRATION_WINDOW_S : ANSWER_SPREAD_S;
  const shift = lagS ?? 0;
  return {
    fromS: Math.max(0, Math.min(...marks) + shift - spread),
    toS: Math.max(...marks) + shift + spread,
  };
}

/**
 * Mediana de la distancia entre cada pregunta y la respuesta que se le
 * encontro. Mediana y no promedio: una sola respuesta mal ubicada mueve un
 * promedio y no mueve una mediana, y aqui basta con que el modelo se equivoque
 * en una cita para que el promedio apunte a otro sitio del live.
 */
function measureLag(batch: readonly ChatQuestionGroup[], rows: readonly ChatCoverageRow[]) {
  const byQuestion = new Map(batch.map((group) => [group.text, group.atSeconds]));
  const deltas: number[] = [];
  for (const row of rows) {
    const asked = byQuestion.get(row.question);
    if (!row.answered || row.atSeconds === null || asked === null || asked === undefined) continue;
    deltas.push(row.atSeconds - asked);
  }
  // Con dos o tres datos la mediana es ruido; preferimos seguir sin medir y
  // mantener la ventana ancha a centrarla en el sitio equivocado.
  if (deltas.length < 4) return null;
  deltas.sort((a, b) => a - b);
  const middle = Math.floor(deltas.length / 2);
  return deltas.length % 2 === 0
    ? Math.round((deltas[middle - 1] + deltas[middle]) / 2)
    : deltas[middle];
}

/**
 * Segunda pasada de redaccion, igual que en los hallazgos. La pregunta ya entro
 * redactada y el modelo no la reescribe, pero la cita de evidencia SI sale del
 * modelo y puede traer un identificador que la transcripcion redactada no tenia
 * en esa forma.
 */
function sanitizeQuote(quote: string | null) {
  if (!quote) return null;
  const redacted = redactPii(quote).trim();
  return hasSubstance(redacted) ? redacted : null;
}

export async function collectChatCoverage(
  input: ChatCoverageInput,
  generate: GenerateBatch,
): Promise<ChatCoverageOutcome> {
  // Se parsea PRIMERO y se redacta despues, nunca al reves. Un handle como
  // @user605404570517 tiene 16 digitos, asi que redactar antes lo convierte en
  // @user[telefono] —con corchetes que el patron del handle no reconoce— y el
  // prefijo se queda pegado al texto de la pregunta para siempre. Ademas cada
  // usuaria arrastra el suyo, asi que dos personas preguntando lo mismo dejan
  // de agrupar. Medido sobre un live real: 14 de 250 filas afectadas.
  const parsed = parseChatLog(input.chatLog);
  const mensajes = parsed.messages.map((message) => ({
    ...message,
    text: redactPii(message.text),
  }));
  // Un mensaje que era solo un telefono llega aqui convertido en "[telefono]":
  // pasa el filtro de longitud pero no dice nada, y guardarlo seria una fila
  // vacia con forma de pregunta.
  const questions = groupQuestions(mensajes).filter((question) => hasSubstance(question.text));

  // El chat empieza con el live; el audio, con la grabacion. Si el chat llega
  // mas lejos que el audio, la grabacion no cubre el live entero y hay
  // preguntas cuyo audio simplemente no existe: nunca podran salir respondidas,
  // y eso no es culpa del analisis.
  const ultimoDelChat = questions.reduce<number | null>(
    (mayor, question) =>
      question.atSeconds === null ? mayor : Math.max(mayor ?? 0, question.atSeconds),
    null,
  );
  const chatBeyondAudioS =
    ultimoDelChat !== null && input.durationS ? ultimoDelChat - input.durationS : null;

  if (questions.length === 0) {
    return {
      rows: [],
      droppedNoise: parsed.droppedNoise,
      questionCount: 0,
      notQuestions: 0,
      batches: 0,
      failedBatches: 0,
      lagS: null,
      chatBeyondAudioS,
    };
  }

  const transcriptLines = parseTranscript(redactPii(input.transcript));
  const anchored = hasMarks(transcriptLines);
  const batches = batchQuestions(questions);

  async function runBatch(
    batch: readonly ChatQuestionGroup[],
    lagS: number | null,
  ): Promise<{ rows: ChatCoverageRow[]; failed: boolean; notQuestions: number }> {
    const window = windowFor(batch, lagS);
    // Sin ventana no hay recorte honesto posible y se manda el tramo entero.
    // Es el caso caro, y por eso `batchQuestions` agrupa esas preguntas en
    // lotes grandes: lo que cuesta es el numero de lotes.
    const transcript =
      window === null
        ? transcriptLines.map((line) => line.text).join("\n")
        : anchored
          ? sliceByTime(transcriptLines, window.fromS, window.toS)
          : sliceByFraction(transcriptLines, window.fromS, window.toS, input.durationS ?? 0);

    const rendered = buildChatCoveragePrompt({ transcript, questions: batch });
    const generated = await generate({
      advisorId: input.advisorId,
      purpose: "chat_coverage",
      promptId: input.promptId,
      schema: chatCoverageBatchSchema,
      system: rendered.system,
      messages: rendered.messages,
      maxTokens: batchMaxTokens(batch.length),
      // La decision es de forma fija —si/no mas una cita literal que hay que
      // encontrar, no redactar—, y razonar sobre ella no compra acierto.
      effort: "low",
    });

    if (!generated.ok) {
      logFailure("collectChatCoverage", new Error(generated.error.message));
      return { rows: [], failed: true, notQuestions: 0 };
    }

    const seen = new Set<number>();
    const rows: ChatCoverageRow[] = [];
    let notQuestions = 0;
    for (const item of generated.data.value.items) {
      const question = batch[item.i];
      // Un indice fuera de rango o repetido es alucinacion del modelo, no un
      // mensaje: se descarta en vez de guardar una fila sin origen.
      if (!question || seen.has(item.i)) continue;
      seen.add(item.i);
      // "Holi", "ya te escribi", "@otra 189.000": no preguntan nada, y como
      // salen con answered=false contaminaban justo la lista de lo que quedo
      // sin responder, que es la unica que la asesora necesita mirar.
      if (!item.es_pregunta) {
        notQuestions += 1;
        continue;
      }
      // Una respuesta no puede ocurrir ANTES de que la pregunta aparezca. El
      // modelo empareja por contenido y a veces atribuye una frase a una
      // pregunta posterior; el reloj lo desmiente. Medido en un simulacro real:
      // una frase del segundo 10 asignada a una pregunta del segundo 21.
      // Se compara contra la pregunta DESPLAZADA por el desfase medido: en un
      // live cuya grabacion arranco tarde, una respuesta legitima cae antes en
      // segundos crudos. Mientras el desfase no se conozca no se puede juzgar,
      // y por eso durante la calibracion no se descarta nada.
      const acausal =
        item.answered &&
        lagS !== null &&
        item.at_seconds !== null &&
        question.atSeconds !== null &&
        item.at_seconds < question.atSeconds + lagS - MAX_ADELANTO_S;
      const answered = item.answered && !acausal;
      const quote = answered ? sanitizeQuote(item.evidence_quote) : null;
      rows.push({
        question: question.text,
        answered,
        evidenceQuote: quote,
        // Un segundo sin respuesta no significa nada: si no la respondio, no
        // hay punto del video al que mandar a la asesora.
        atSeconds: answered ? item.at_seconds : null,
        askedCount: question.askedCount,
      });
    }
    return { rows, failed: false, notQuestions };
  }

  // Con los relojes alineados no hay desfase que medir: todos los lotes salen
  // a la vez con desplazamiento cero y la causalidad se aplica desde el primero.
  if (input.clocksAligned) {
    const outcomes = await mapWithConcurrency(batches, AI_PROVIDER.maxConcurrency, (batch) =>
      runBatch(batch, 0),
    );
    return {
      rows: outcomes.flatMap((outcome) => outcome.rows),
      droppedNoise: parsed.droppedNoise,
      questionCount: questions.length,
      notQuestions: outcomes.reduce((total, outcome) => total + outcome.notQuestions, 0),
      batches: batches.length,
      failedBatches: outcomes.filter((outcome) => outcome.failed).length,
      lagS: 0,
      chatBeyondAudioS,
    };
  }

  // El primer lote corre solo y con ventana ancha: es el que MIDE el desfase
  // entre los dos relojes. Cuesta un tramo mas grande de transcripcion una vez,
  // y a cambio los demas pueden mirar estrecho y en el sitio correcto.
  const [calibrador, ...resto] = batches;
  const primero = await runBatch(calibrador, null);
  const lagS = measureLag(calibrador, primero.rows);

  const outcomes = [
    primero,
    ...(await mapWithConcurrency(resto, AI_PROVIDER.maxConcurrency, (batch) =>
      runBatch(batch, lagS),
    )),
  ];

  return {
    rows: outcomes.flatMap((outcome) => outcome.rows),
    droppedNoise: parsed.droppedNoise,
    questionCount: questions.length,
    batches: batches.length,
    failedBatches: outcomes.filter((outcome) => outcome.failed).length,
    notQuestions: outcomes.reduce((total, outcome) => total + outcome.notQuestions, 0),
    lagS,
    chatBeyondAudioS,
  };
}
