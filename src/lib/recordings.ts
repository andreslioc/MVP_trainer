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

export const MAX_RECORDING_BYTES = 200 * 1024 * 1024;

export const RECORDING_MIME_EXTENSIONS = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "video/mp4": "mp4",
} as const;

export type RecordingMime = keyof typeof RECORDING_MIME_EXTENSIONS;

export const RECORDING_ACCEPT = Object.keys(RECORDING_MIME_EXTENSIONS).join(",");

export function megabytes(bytes: number) {
  return Math.round(bytes / (1024 * 1024));
}

/** Devuelve el motivo por el que el archivo no sirve, o null si sirve. */
export function recordingFileProblem(file: { type: string; size: number }) {
  if (!(file.type in RECORDING_MIME_EXTENSIONS)) {
    return "Ese formato no se admite. Sube un mp3, m4a, wav, webm o mp4.";
  }
  if (file.size > MAX_RECORDING_BYTES) {
    return `El archivo pesa ${megabytes(file.size)} MB y el máximo son ${megabytes(MAX_RECORDING_BYTES)} MB. Comprime el audio o corta el live en partes.`;
  }
  if (file.size === 0) return "El archivo está vacío.";
  return null;
}
