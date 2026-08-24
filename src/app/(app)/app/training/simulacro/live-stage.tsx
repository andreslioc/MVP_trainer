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

import { useEffect, useRef } from "react";

import type { SimLine } from "../../../../../lib/simulator/chat-player.ts";

/** Alto de la capsula del chat, en pixeles. */
const CHAT_HEIGHT = 300;

/** Cuantas lineas se conservan a la vista antes de empezar a soltar las viejas. */
const VISIBLE_LINES = 8;

export function LiveStage({
  lines,
  elapsedMs,
  stream,
}: {
  lines: readonly SimLine[];
  elapsedMs: number;
  /** Capturado una sola vez arriba: en iOS una segunda captura apaga esta. */
  stream: MediaStream | null;
}) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const node = video.current;
    if (!node || !stream) return;
    node.srcObject = stream;
    // `autoPlay` no basta en todos lados: Safari ignora el atributo cuando el
    // `srcObject` se asigna despues de montar, y el elemento se queda en negro
    // con el stream conectado y sin reproducir. Se llama a `play()` y se ignora
    // el rechazo, que solo ocurre si el elemento ya se desmonto.
    node.play().catch(() => undefined);
  }, [stream]);

  const visible = lines.filter((line) => line.atMs <= elapsedMs).slice(-VISIBLE_LINES);

  return (
    <div className="relative aspect-[9/16] w-full max-w-sm overflow-hidden rounded-card bg-fg">
      <video
        aria-label="Vista previa de tu cámara"
        autoPlay
        // Espejada, como cualquier camara frontal: verse invertida al moverse
        // desorienta y es lo que hace toda app de video.
        className="size-full -scale-x-100 object-cover"
        muted
        playsInline
        ref={video}
      >
        <track kind="captions" />
      </video>

      {stream === null ? (
        // Un recuadro negro sin explicacion se lee como "se rompio". Esto solo
        // aparece si la captura se solto despues de haber arrancado.
        <p className="absolute inset-x-3 top-3 rounded-card bg-surface p-3 text-sm text-fg-muted">
          Sin señal de cámara. Termina el simulacro y vuelve a empezar.
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
