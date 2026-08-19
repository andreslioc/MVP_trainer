import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Recomprime audio para que quepa en el limite del proveedor de transcripcion.
 *
 * Opus mono a 16 kHz porque es exactamente lo que un modelo de voz consume: la
 * voz humana vive por debajo de los 8 kHz, asi que el estereo y las frecuencias
 * altas son bytes que se pagan y que el modelo descarta igual. Medido sobre
 * audio real: 16 kbps deja tres horas en 23 MB, bajo el tope de 25 MB del tier
 * gratuito de Groq.
 *
 * Esto NO abarata Deepgram, que cobra por duracion y no por peso. Existe por el
 * limite de tamano de Groq y para que la subida no muera a medio camino.
 *
 * `bestEffort` distingue dos usos que parecian uno solo. Al SUBIR, el objetivo
 * es economia de almacenamiento y quedarse corto no justifica perder el
 * archivo: 26 MB siguen siendo seis veces menos que 156, asi que se guarda lo
 * que salga. Al TRANSCRIBIR, el tope es del proveedor y pasarse significa que
 * la peticion sera rechazada, asi que ahi si hay que fallar y decirlo.
 */

const OPUS_BITRATE = "16k";
const COMPRESS_TIMEOUT_MS = 600_000;

export type CompressResult =
  | {
      ok: true;
      data: { audio: ArrayBuffer; contentType: string; compressed: boolean; bytes: number };
    }
  | { ok: false; error: { code: string; message: string } };

type Runner = (input: string, output: string) => Promise<{ ok: boolean; stderr: string }>;

function runFfmpeg(input: string, output: string) {
  return new Promise<{ ok: boolean; stderr: string }>((resolve) => {
    const child = spawn(
      "ffmpeg",
      // biome-ignore format: un argumento por concepto se lee mejor agrupado
      [
        "-y", "-loglevel", "error",
        "-i", input,
        "-vn",                          // descarta el video: un mp4 de live trae imagen que nadie transcribe
        "-ac", "1",                     // mono
        "-ar", "16000",                 // 16 kHz: lo que espera un modelo de voz
        "-c:a", "libopus", "-b:a", OPUS_BITRATE,
        // CBR y no el VBR por defecto: medido sobre 2,8 h reales, el VBR de
        // opus se pasa un 30% del bitrate pedido (25,9 MB donde tocaban 19,9) y
        // eso basta para reventar un tope de 25 MB. En CBR el desvio es del 1%,
        // asi que el tamano se puede predecir antes de encodear.
        "-vbr", "off",
        output,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );

    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    const timer = setTimeout(() => child.kill("SIGKILL"), COMPRESS_TIMEOUT_MS);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, stderr: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stderr });
    });
  });
}

export async function compressForTranscription(
  input: { audio: ArrayBuffer; contentType: string },
  options: { maxBytes: number; run?: Runner; bestEffort?: boolean } = {
    maxBytes: 25 * 1024 * 1024,
  },
): Promise<CompressResult> {
  if (input.audio.byteLength <= options.maxBytes) {
    return {
      ok: true,
      data: {
        audio: input.audio,
        contentType: input.contentType,
        compressed: false,
        bytes: input.audio.byteLength,
      },
    };
  }

  let directory: string | undefined;
  try {
    directory = await mkdtemp(join(tmpdir(), "super-store-audio-"));
    const source = join(directory, `${randomUUID()}.src`);
    const target = join(directory, `${randomUUID()}.ogg`);
    await writeFile(source, Buffer.from(input.audio));

    const run = options.run ?? runFfmpeg;
    const result = await run(source, target);
    if (!result.ok) {
      // ffmpeg ausente es un fallo de despliegue, no del archivo: en Vercel no
      // existe el binario. Distinguirlo evita culpar a la grabacion.
      console.error("[compressForTranscription] ffmpeg:", result.stderr.slice(0, 600));
      const missing = result.stderr.includes("ENOENT");
      return {
        ok: false,
        error: {
          code: missing ? "FFMPEG_MISSING" : "COMPRESSION_FAILED",
          message: missing
            ? "ffmpeg no está instalado en este servidor; no se puede comprimir el audio."
            : "No se pudo comprimir el audio para enviarlo a transcribir.",
        },
      };
    }

    const compressed = await readFile(target);
    if (compressed.byteLength > options.maxBytes && !options.bestEffort) {
      return {
        ok: false,
        error: {
          code: "TOO_LONG",
          message: `Aun comprimido el audio pesa ${Math.round(compressed.byteLength / 1048576)} MB y el proveedor admite ${Math.round(options.maxBytes / 1048576)} MB. Corta el live en partes.`,
        },
      };
    }

    return {
      ok: true,
      data: {
        audio: compressed.buffer.slice(
          compressed.byteOffset,
          compressed.byteOffset + compressed.byteLength,
        ) as ArrayBuffer,
        contentType: "audio/ogg",
        compressed: true,
        bytes: compressed.byteLength,
      },
    };
  } catch (error) {
    console.error("[compressForTranscription] fallo:", error);
    return {
      ok: false,
      error: { code: "COMPRESSION_FAILED", message: "No se pudo comprimir el audio." },
    };
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}
