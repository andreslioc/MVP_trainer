"use client";

/**
 * Graba SOLO el audio de la asesora.
 *
 * La camara se muestra pero no se graba: lo que se evalua es lo que dijo. Y
 * grabando audio a bitrate bajo, cinco minutos pesan unos 1,2 MB —muy por
 * debajo de los 25 MB que admite el proveedor—, asi que no hay que comprimir
 * con ffmpeg, que es justo el binario que no existe en Vercel.
 *
 * El formato se negocia con el navegador en vez de fijarlo: Safari en iOS no
 * graba webm y devuelve mp4. Fijar `audio/webm` deja la funcion muerta en
 * iPhone sin ningun error visible.
 */

import { useCallback, useRef, useState } from "react";

const BITS_PER_SECOND = 32_000;

const CANDIDATE_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
] as const;

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  return CANDIDATE_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export function useAudioRecorder() {
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    chunks.current = [];
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      setError(
        typeof window !== "undefined" && !window.isSecureContext
          ? "El micrófono solo funciona sobre HTTPS. Abre la app por el enlace seguro."
          : "No se pudo abrir el micrófono. Revisa los permisos del navegador.",
      );
      return false;
    }

    const mimeType = pickMimeType();
    if (mimeType === null) {
      setError("Este navegador no puede grabar audio. Prueba con Chrome o Safari actualizado.");
      return false;
    }

    const instance = new MediaRecorder(stream.current, {
      mimeType,
      audioBitsPerSecond: BITS_PER_SECOND,
    });
    instance.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data);
    };
    instance.start(1_000);
    recorder.current = instance;
    return true;
  }, []);

  const stop = useCallback(async () => {
    const instance = recorder.current;
    if (!instance) return null;
    const finished = new Promise<Blob>((resolve) => {
      instance.onstop = () => resolve(new Blob(chunks.current, { type: instance.mimeType }));
    });
    instance.stop();
    const blob = await finished;
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    recorder.current = null;
    stream.current = null;
    return blob;
  }, []);

  return { start, stop, error };
}
