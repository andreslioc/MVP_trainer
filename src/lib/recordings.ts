/**
 * Limites de una grabacion de live, compartidos por el navegador y el servidor.
 *
 * Viven aqui y no en `src/server/recordings/upload.ts` porque el navegador tiene
 * que poder rechazar un archivo ANTES de subirlo. Cuando el cuerpo excede el
 * tope de la server action, Next corta el stream a medias y el parser de
 * multipart falla con "Unexpected end of form" —un error que no menciona el
 * tamano y que aparece atribuido a la pagina, no al formulario—. La validacion
 * del servidor sigue existiendo y sigue siendo la que manda; esta solo evita
 * gastar la subida entera para terminar en un mensaje que no explica nada.
 */

/**
 * Lo mas grande que el navegador acepta intentar convertir.
 *
 * Ya no es el tope de subida —eso lo decide el plan de Supabase y viaja aparte—
 * sino el techo del ARCHIVO DE ORIGEN, que puede ser el video crudo de un live.
 * Los de Super Store van de 5 MB a 1,3 GB, asi que dos gigas deja margen sin
 * prometer algo que el navegador no puede sostener: la conversion va por partes
 * y no carga el archivo entero, pero leerlo y recorrerlo si tiene un limite
 * practico.
 */
export const MAX_RECORDING_BYTES = 2 * 1024 * 1024 * 1024;

export const RECORDING_MIME_EXTENSIONS = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "video/mp4": "mp4",
} as const;

export type RecordingMime = keyof typeof RECORDING_MIME_EXTENSIONS;

export const RECORDING_ACCEPT = Object.keys(RECORDING_MIME_EXTENSIONS).join(",");

export function megabytes(bytes: number) {
  return Math.round(bytes / (1024 * 1024));
}

/** Devuelve el motivo por el que el archivo no sirve, o null si sirve. */
/**
 * Que le pasa a este archivo, si algo.
 *
 * `maxBytes` viene del servidor y no de la constante: el tope real lo pone el
 * plan de Supabase —50 MB en el gratuito— y no este proyecto. Antes el
 * navegador aceptaba hasta 200 MB y el servidor rechazaba en 50, asi que la
 * asesora elegia un archivo, le decian que estaba bien, y despues que no.
 *
 * El mensaje esta escrito para una asesora, no para quien programa. Comprimir
 * no se puede hacer en el servidor —ffmpeg no existe donde corre la app— pero
 * poner el comando de ffmpeg en pantalla tampoco sirve: lo lee alguien que esta
 * en el telefono, sin terminal, y que no tiene por que saber que es eso.
 *
 * Lo que si sabe es la diferencia entre el video del live y su audio, que es la
 * causa del 90% de los casos. El mensaje apunta a eso y deja el paso tecnico
 * para quien administra.
 */
export function recordingFileProblem(
  file: { type: string; size: number },
  maxBytes: number = MAX_RECORDING_BYTES,
  /** El navegador puede encoger el archivo antes de subirlo. */
  canConvert = false,
) {
  if (!(file.type in RECORDING_MIME_EXTENSIONS)) {
    return "Ese formato no se admite. Sube un mp3, m4a, wav, ogg, webm o mp4.";
  }
  if (file.size === 0) return "El archivo está vacío.";
  // Pesado pero convertible no es un problema: la pagina lo encoge antes de
  // subirlo. Solo se rechaza cuando no hay forma de arreglarlo aqui.
  if (file.size > maxBytes && !canConvert) {
    return `Este archivo pesa ${megabytes(file.size)} MB y el máximo son ${megabytes(maxBytes)} MB. Este navegador no puede convertirlo: ábrelo en Chrome o Edge desde un computador, o sube el archivo de audio de esa misma descarga, que pesa mucho menos.`;
  }
  if (file.size > MAX_RECORDING_BYTES) {
    return `Este archivo pesa ${megabytes(file.size)} MB y no se puede procesar. Sube la grabación del live, no un archivo completo de varias horas en alta calidad.`;
  }
  return null;
}

/**
 * Segundo del live en `minutos:segundos`, o en `horas:minutos:segundos` cuando
 * pasa de la hora.
 *
 * Una sola definicion para los tres sitios que la usan —hallazgos, preguntas
 * del chat y visor de transcripcion—, porque la comparacion entre ellos es el
 * trabajo: si la pregunta dice "30:40" y la transcripcion dice "[1840s]",
 * verificar ese momento obliga a una division mental que nadie deberia hacer.
 *
 * Pasada la hora se muestran las tres partes. Contar los minutos de corrido
 * —"70:34"— obliga a dividir otra vez para saber que eso es la hora con diez,
 * y en un live de dos horas y media eso es la mitad de las marcas. Es ademas el
 * formato en que TikTok exporta el chat, asi que la linea del visor termina
 * diciendo lo mismo que decia en origen.
 */
export function formatMark(atSeconds: number | null) {
  if (atSeconds === null) return null;
  const hours = Math.floor(atSeconds / 3600);
  const minutes = Math.floor((atSeconds % 3600) / 60);
  const seconds = atSeconds % 60;
  const paddedSeconds = String(seconds).padStart(2, "0");
  if (hours === 0) return `${minutes}:${paddedSeconds}`;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
}

/** `[104s]` al inicio de una linea de transcripcion. */
const TRANSCRIPT_MARK = /^\[(\d+)s\]/;

/** `[01:44:20]` o `[44:20]` al inicio de una linea del chat. */
const CHAT_MARK = /^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/;

/**
 * Reescribe la marca de tiempo de una linea al mismo formato que muestran los
 * hallazgos y las preguntas. Deja intacta la linea que no trae marca.
 */
export function humanizeMark(line: string) {
  const transcript = line.match(TRANSCRIPT_MARK);
  if (transcript) {
    return line.replace(TRANSCRIPT_MARK, `[${formatMark(Number(transcript[1]))}]`);
  }

  const chat = line.match(CHAT_MARK);
  if (chat) {
    const [, first, second, third] = chat;
    const total =
      third === undefined
        ? Number(first) * 60 + Number(second)
        : Number(first) * 3600 + Number(second) * 60 + Number(third);
    return line.replace(CHAT_MARK, `[${formatMark(total)}]`);
  }

  return line;
}
