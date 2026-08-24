"use client";

/**
 * Captura de camara y microfono para el simulacro, en UNA sola peticion.
 *
 * Pedirlos por separado —primero video, despues audio— parecia inocente y en
 * movil no lo es: iOS admite una sola captura activa, asi que la segunda
 * llamada apagaba el stream de la camara. El sintoma era exactamente "da los
 * permisos y no se ve nada", sin ningun error.
 *
 * De paso resuelve otras dos: se pide `facingMode: "user"` porque en un telefono
 * `video: true` entrega la camara TRASERA, y se pide una sola vez para que el
 * navegador muestre un solo aviso de permisos en lugar de dos.
 *
 * La camara se muestra y NO se graba: al grabar se toma solo la pista de audio.
 *
 * Abrir la camara y empezar a grabar son dos pasos separados a proposito. Entre
 * ellos va la cuenta regresiva: la asesora se ve y se acomoda mientras la
 * camara ya esta encendida, y la grabacion arranca EXACTAMENTE cuando arranca el
 * reloj del chat. De eso depende que los dos relojes esten alineados, que es lo
 * que el analisis da por cierto al medir la reaccion.
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

export function useLiveCapture() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const active = useRef<MediaStream | null>(null);

  /** Enciende camara y microfono. Todavia no graba. */
  const open = useCallback(async () => {
    setError(null);
    chunks.current = [];

    let captured: MediaStream;
    try {
      captured = await navigator.mediaDevices.getUserMedia({
        // `ideal` y no `exact`: un portatil sin camara frontal declarada debe
        // seguir funcionando en vez de fallar con OverconstrainedError.
        video: { facingMode: { ideal: "user" } },
        audio: true,
      });
    } catch {
      setError(
        typeof window !== "undefined" && !window.isSecureContext
          ? "La cámara y el micrófono solo funcionan sobre HTTPS. Abre la app por el enlace seguro."
          : "No se pudo abrir la cámara o el micrófono. Revisa los permisos del navegador.",
      );
      return false;
    }

    // Se revisa aqui y no al grabar: descubrir que el navegador no puede
    // grabar despues de la cuenta regresiva desperdicia el tiempo de la asesora
    // y la deja creyendo que el simulacro arranco.
    if (pickMimeType() === null) {
      for (const track of captured.getTracks()) track.stop();
      setError("Este navegador no puede grabar audio. Prueba con Chrome o Safari actualizado.");
      return false;
    }

    active.current = captured;
    setStream(captured);
    return true;
  }, []);

  /** Arranca la grabacion. Se llama en el mismo instante que el reloj del chat. */
  const record = useCallback(() => {
    const captured = active.current;
    const mimeType = pickMimeType();
    if (!captured || mimeType === null) return false;

    // Solo la pista de audio entra a la grabacion: lo que se evalua es lo que
    // dijo, y grabar video multiplicaria el peso sin que nadie lo mire.
    const instance = new MediaRecorder(new MediaStream(captured.getAudioTracks()), {
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
    let blob: Blob | null = null;
    if (instance) {
      const finished = new Promise<Blob>((resolve) => {
        instance.onstop = () => resolve(new Blob(chunks.current, { type: instance.mimeType }));
      });
      instance.stop();
      blob = await finished;
    }
    for (const track of active.current?.getTracks() ?? []) track.stop();
    recorder.current = null;
    active.current = null;
    setStream(null);
    return blob;
  }, []);

  return { stream, open, record, stop, error };
}
