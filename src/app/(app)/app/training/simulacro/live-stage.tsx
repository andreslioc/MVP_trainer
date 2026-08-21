"use client";

/**
 * Escenario del simulacro: la camara de la asesora con el chat encima.
 *
 * La camara se MUESTRA y no se graba. Lo unico que se captura es el audio,
 * porque lo que se evalua es lo que dijo, no como se veia. Verse en pantalla
 * existe para que el simulacro se sienta como estar en camara.
 *
 * El chat va en una capsula translucida sobre el video, como en TikTok, y se
 * limita en alto: si creciera, el simulacro dejaria de parecerse a un live y la
 * asesora leeria comodamente lo que en camara pasa volando.
 */

import { useEffect, useRef, useState } from "react";

import type { SimLine } from "../../../../../lib/simulator/chat-player.ts";

/** Alto de la capsula del chat, en pixeles. */
const CHAT_HEIGHT = 300;

/** Cuantas lineas se conservan a la vista antes de empezar a soltar las viejas. */
const VISIBLE_LINES = 8;

export function LiveStage({
  lines,
  elapsedMs,
  running,
}: {
  lines: readonly SimLine[];
  elapsedMs: number;
  running: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    if (!running) return;
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        if (video.current) video.current.srcObject = stream;
      } catch {
        // El caso mas comun no es un permiso negado: es que la pagina no esta
        // en HTTPS. En el celular, sobre http, el navegador ni pregunta.
        setCameraError(
          window.isSecureContext
            ? "No se pudo abrir la cámara. Revisa los permisos del navegador."
            : "La cámara solo funciona sobre HTTPS. Abre la app por el enlace seguro, no por la IP.",
        );
      }
    }

    start();
    return () => {
      cancelled = true;
      if (stream) for (const track of stream.getTracks()) track.stop();
    };
  }, [running]);

  const visible = lines.filter((line) => line.atMs <= elapsedMs).slice(-VISIBLE_LINES);

  return (
    <div className="relative aspect-[9/16] w-full max-w-sm overflow-hidden rounded-card bg-fg">
      <video
        aria-label="Vista previa de tu cámara"
        className="size-full object-cover"
        muted
        playsInline
        ref={video}
      >
        <track kind="captions" />
      </video>

      {cameraError ? (
        <p
          className="absolute inset-x-3 top-3 rounded-card bg-surface p-3 text-sm font-semibold text-confidence-low-fg"
          role="alert"
        >
          {cameraError}
        </p>
      ) : null}

      <ol
        aria-label="Chat del live"
        aria-live="polite"
        className="absolute inset-x-0 bottom-0 flex flex-col justify-end gap-1 overflow-hidden p-3"
        style={{ height: `${CHAT_HEIGHT}px` }}
      >
        {visible.map((line) => (
          // Todas las lineas se ven igual, incluidas las preguntas. Resaltarlas
          // regalaba el ejercicio: lo que se entrena es detectarlas entre el
          // ruido, y en un live real ninguna viene marcada.
          <li
            className="w-fit max-w-full rounded-card bg-fg/45 px-2 py-1 text-sm text-white"
            key={`${line.atMs}-${line.text}`}
          >
            <span className="opacity-70">{line.author}</span> {line.text}
          </li>
        ))}
      </ol>
    </div>
  );
}
