/**
 * Convierte un archivo de live a audio liviano, dentro del navegador.
 *
 * Existe porque el camino manual eran tres pasos con terminal —descargar el
 * video de 1,3 GB, sacar el audio de 157 MB, comprimirlo a 26— y quien sube una
 * grabacion no tiene por que saber que es un codec. Aqui elige el archivo y la
 * pagina hace el resto.
 *
 * Va en el navegador y no en el servidor por una razon de orden: para que el
 * servidor lo convirtiera, el archivo primero tendria que estar en Storage, y
 * es justo ahi donde pega el tope de tamano. Hay que encogerlo ANTES de subir.
 *
 * Usa WebCodecs a traves de mediabunny: los codecs son los nativos del
 * navegador, asi que decodificar y recodificar dos horas toma minutos y no
 * horas, y el archivo se procesa por partes en vez de cargarse entero en
 * memoria.
 */

/** Mono: un live es una voz, y el estereo duplica los bytes sin aportar nada. */
const CHANNELS = 1;

/**
 * 24 kbps en opus. Medido sobre un live real de 2 h 22 min: 549 MB de video
 * quedan en 15 MB, y de 2 h 30 en 26 MB. Ambos entran holgados en el tope de
 * subida, y la transcripcion no pierde fidelidad porque el limite ahi lo pone
 * el microfono, no el bitrate.
 */
const BITRATE = 24_000;

/**
 * Configuraciones a probar, de la mas liviana a la mas conservadora.
 *
 * No se fija una sola porque el navegador decide que acepta y no coincide con
 * lo que uno supondria: pedir opus a 16 kHz —el ritmo que consumen los modelos
 * de voz— falla en Chrome con "Unsupported configuration", porque su
 * codificador de opus quiere 48 kHz. Y bajar el sample rate tampoco ahorraba
 * nada: con bitrate fijo, el tamano lo decide el bitrate y no la frecuencia.
 *
 * Se prueban INICIANDO la conversion de verdad, no con `canEncodeAudio`:
 * medido en Chrome, ese chequeo devuelve `true` para configuraciones que
 * despues `configure()` rechaza. Preguntar no sirve; hay que intentar.
 *
 * De mas especificada a menos: la ultima deja que mediabunny elija todo salvo
 * el codec, que es la que mas probabilidades tiene de funcionar.
 */
const CANDIDATES: ReadonlyArray<{
  numberOfChannels?: number;
  sampleRate?: number;
  bitrate?: number;
}> = Object.freeze([
  { numberOfChannels: CHANNELS, sampleRate: 48_000, bitrate: BITRATE },
  { numberOfChannels: CHANNELS, bitrate: BITRATE },
  { bitrate: BITRATE },
  { bitrate: 64_000 },
  {},
]);

export type ConversionProgress = {
  /** Entre 0 y 1. */
  ratio: number;
  /** Segundos del audio ya procesados. */
  processedS: number;
};

export type ConversionResult =
  | { ok: true; file: File; originalBytes: number }
  | { ok: false; reason: "unsupported" | "no-audio" | "failed"; message: string };

/**
 * El navegador puede convertir aqui mismo.
 *
 * Se revisa antes de ofrecerlo: prometer una conversion y fallar a la mitad es
 * peor que decir de entrada que hay que subir el audio ya listo.
 */
export function canConvertInBrowser() {
  return (
    typeof globalThis.AudioEncoder !== "undefined" && typeof globalThis.AudioDecoder !== "undefined"
  );
}

export async function convertToLightAudio(
  file: File,
  onProgress?: (progress: ConversionProgress) => void,
): Promise<ConversionResult> {
  if (!canConvertInBrowser()) {
    return {
      ok: false,
      reason: "unsupported",
      message:
        "Este navegador no puede convertir el archivo. Ábrelo en Chrome o Edge desde un computador.",
    };
  }

  try {
    const { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Output, WebMOutputFormat } =
      await import("mediabunny");

    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const audioTracks = await input.getAudioTracks();
    if (audioTracks.length === 0) {
      return {
        ok: false,
        reason: "no-audio",
        message: "Ese archivo no tiene pista de audio. Sube la grabación del live.",
      };
    }

    // Se intenta configuracion por configuracion hasta que una arranque. El
    // fallo llega al configurar el codificador, asi que atraparlo aqui es la
    // unica forma de saber cual sirve en este navegador.
    let conversion: Awaited<ReturnType<typeof Conversion.init>> | null = null;
    let target: InstanceType<typeof BufferTarget> | null = null;
    let lastError = "";
    for (const candidate of CANDIDATES) {
      const attempt = new BufferTarget();
      const output = new Output({ format: new WebMOutputFormat(), target: attempt });
      try {
        conversion = await Conversion.init({
          input,
          output,
          // El video se descarta entero: no se transcribe y es el 98% del peso.
          video: { discard: true },
          audio: {
            codec: "opus",
            ...candidate,
            // Sin esto, un audio que ya viniera en opus se copiaria tal cual y
            // saldria con el bitrate original, que es lo que queremos bajar.
            forceTranscode: true,
          },
        });
        if (conversion.isValid) {
          target = attempt;
          break;
        }
        lastError = conversion.discardedTracks.map((track) => track.reason).join(", ");
        conversion = null;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        conversion = null;
      }
    }

    if (conversion === null) {
      const codec = await audioTracks[0]?.getCodec();
      return {
        ok: false,
        reason: "unsupported",
        message: `Este navegador no puede comprimir el audio de este archivo (pista ${codec ?? "desconocida"}: ${lastError}). Ábrelo en Chrome o Edge desde un computador, o sube el archivo de audio de esa misma descarga.`,
      };
    }
    if (onProgress) {
      conversion.onProgress = (ratio, processedTime) =>
        onProgress({ ratio, processedS: processedTime });
    }

    await conversion.execute();
    const buffer = target?.buffer;
    if (!buffer) throw new Error("La conversión no produjo audio.");

    const name = `${file.name.replace(/\.[^.]+$/, "")}-audio.webm`;
    return {
      ok: true,
      file: new File([buffer], name, { type: "audio/webm" }),
      originalBytes: file.size,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "failed",
      // El detalle tecnico va al final y entre parentesis: lo primero que se
      // lee tiene que ser algo que la persona pueda hacer.
      message: `No se pudo convertir este archivo. Prueba con el archivo de audio de esa misma descarga, que pesa mucho menos.${
        error instanceof Error && error.message ? ` (${error.message})` : ""
      }`,
    };
  }
}

/**
 * Duracion del archivo, en segundos, leida por el navegador.
 *
 * Hace falta para elegir proveedor de transcripcion. Groq admite 7.200 segundos
 * de audio por hora de reloj, asi que un live de dos horas y media no le cabe
 * —y eso NO se puede deducir del tamano: comprimido a opus, dos horas y media
 * pesan 17 MB, menos que muchos archivos cortos sin comprimir.
 *
 * Antes la medía ffprobe en el servidor, pero ese binario no existe en Vercel.
 * El navegador ya tiene el archivo en la mano y lo sabe sin descargarlo dos
 * veces.
 */
export function readDurationSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const media = document.createElement("audio");
    const finish = (value: number | null) => {
      URL.revokeObjectURL(url);
      media.remove();
      resolve(value);
    };
    // Un archivo que el navegador no sabe leer no debe colgar la subida: se
    // sigue sin duracion, que es como estaba antes de esta funcion.
    const timer = setTimeout(() => finish(null), 15_000);
    media.preload = "metadata";
    media.onloadedmetadata = () => {
      clearTimeout(timer);
      finish(Number.isFinite(media.duration) ? Math.round(media.duration) : null);
    };
    media.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    media.src = url;
  });
}
