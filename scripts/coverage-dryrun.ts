/**
 * Mide, sin llamar al proveedor, lo que la cobertura de chat le enviaria a un
 * modelo para una grabacion ya guardada. Sirve para comparar el costo del
 * troceado con recorte contra mandarlo todo de una sola vez.
 *
 * Uso: pnpm tsx scripts/coverage-dryrun.ts <recording_id>
 */

import { buildChatCoveragePrompt } from "../src/lib/ai/prompts/chat-coverage.ts";
import { redactPii } from "../src/lib/ai/prompts/analyze-transcript.ts";
import { batchQuestions, groupQuestions, parseChatLog } from "../src/lib/chat-log.ts";
import { loadEnv } from "../src/lib/load-env.ts";
import {
  ANSWER_SPREAD_S,
  CALIBRATION_WINDOW_S,
  hasMarks,
  parseTranscript,
  sliceByFraction,
  sliceByTime,
} from "../src/lib/transcript.ts";

loadEnv();

/**
 * Calibrado contra una llamada real, no supuesto: 166.890 caracteres de
 * transcripcion y chat en espanol dieron 54.245 tokens reportados por el
 * proveedor. Un cuatro generico subestimaria el costo en un 30%.
 */
const CHARS_PER_TOKEN = 3.08;

async function main() {
  const recordingId = process.argv[2];
  if (!recordingId) throw new Error("Falta el id de la grabacion.");

  const [{ openDirectDatabase }, { liveRecordings }, { eq }] = await Promise.all([
    import("../src/db/client.ts"),
    import("../src/db/schema.ts"),
    import("drizzle-orm"),
  ]);
  const connection = openDirectDatabase("dev");

  try {
    const [recording] = await connection.db
      .select({
        transcript: liveRecordings.transcript,
        chatLog: liveRecordings.chatLog,
        durationS: liveRecordings.durationS,
      })
      .from(liveRecordings)
      .where(eq(liveRecordings.id, recordingId))
      .limit(1);
    if (!recording?.chatLog || !recording.transcript) {
      throw new Error("La grabacion no tiene chat o transcripcion.");
    }
    const sourceChat = recording.chatLog;

    // `--multiplicar-chat=N` reinyecta el chat con preguntas distintas para ver
    // como escala el costo cuando un live trae el triple de comentarios.
    const factor = Number(
      process.argv.find((arg) => arg.startsWith("--multiplicar-chat="))?.split("=")[1] ?? 1,
    );
    const chatLog =
      factor > 1
        ? Array.from({ length: factor }, (_value, round) =>
            sourceChat
              .split("\n")
              .map((line) => line.replace(/: /, `: ronda${round} `))
              .join("\n"),
          ).join("\n")
        : sourceChat;

    const parsed = parseChatLog(redactPii(chatLog));
    const questions = groupQuestions(parsed.messages);
    const batches = batchQuestions(questions);
    // `--simular-marcas` reparte marcas de tiempo parejas sobre una
    // transcripcion que no las trae, para medir lo que costaria el camino
    // anclado una vez re-transcrita.
    const simulate = process.argv.includes("--simular-marcas");
    const raw = redactPii(recording.transcript);
    const source = simulate
      ? raw
          .split("\n")
          .filter((line) => line.trim())
          .map((line, index, all) => {
            const at = Math.round(((recording.durationS ?? 0) * index) / all.length);
            return `[${at}s] ${line.trim()}`;
          })
          .join("\n")
      : raw;
    const lines = parseTranscript(source);
    const anchored = hasMarks(lines);

    let sent = 0;
    for (const [indice, batch] of batches.entries()) {
      // El primer lote calibra el desfase y por eso mira ancho; los demas ya
      // miran estrecho. Se refleja aqui para que la medida no mienta.
      const spread = indice === 0 ? CALIBRATION_WINDOW_S : ANSWER_SPREAD_S;
      const marks = batch.map((group) => group.atSeconds).filter((at): at is number => at !== null);
      const fromS = marks.length ? Math.max(0, Math.min(...marks) - spread) : 0;
      const toS = marks.length ? Math.max(...marks) + spread : 0;
      const transcript = !marks.length
        ? lines.map((line) => line.text).join("\n")
        : anchored
          ? sliceByTime(lines, fromS, toS)
          : sliceByFraction(lines, fromS, toS, recording.durationS ?? 0);
      const rendered = buildChatCoveragePrompt({ transcript, questions: batch });
      sent += rendered.system.length + rendered.messages.reduce((n, m) => n + m.content.length, 0);
    }

    const transcriptChars = lines.reduce((n, line) => n + line.text.length + 1, 0);
    const naive = batches.length * (transcriptChars + chatLog.length);

    console.log(`transcripcion con marcas [Xs]: ${anchored ? "si" : "no"}`);
    console.log(`lineas de chat crudas:         ${chatLog.split("\n").length}`);
    console.log(`ruido filtrado en codigo:      ${parsed.droppedNoise}`);
    console.log(`mensajes utiles:               ${parsed.messages.length}`);
    console.log(`preguntas distintas:           ${questions.length}`);
    console.log(`repetidas colapsadas:          ${parsed.messages.length - questions.length}`);
    console.log(`lotes:                         ${batches.length}`);
    console.log(`entrada con recorte:      ~${Math.round(sent / CHARS_PER_TOKEN)} tokens`);
    console.log(`entrada sin recorte:      ~${Math.round(naive / CHARS_PER_TOKEN)} tokens`);
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
