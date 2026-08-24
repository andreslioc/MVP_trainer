"use client";

/**
 * Medidor de microfono en vivo.
 *
 * Existe porque grabar es invisible: sin esto, la asesora habla cinco minutos
 * sin saber si la estan escuchando, y solo se entera al final cuando la
 * transcripcion sale vacia. La barra se mueve con su voz, asi que un microfono
 * silenciado o tapado se nota en el primer segundo.
 */

import { useEffect, useRef, useState } from "react";

/**
 * Las barras del medidor, con su altura.
 *
 * Una lista fija en vez de contar indices: son elementos estables que nunca se
 * reordenan, asi que cada una puede llevar su propia identidad.
 */
const BARS = Object.freeze(
  Array.from({ length: 12 }, (_value, index) => ({
    id: `barra-${index}`,
    height: 8 + index * 1.5,
  })),
);

export function MicMeter({ stream }: { stream: MediaStream | null }) {
  const [level, setLevel] = useState(0);
  const frame = useRef(0);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) return;

    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.frequencyBinCount);

    function tick() {
      analyser.getByteTimeDomainData(samples);
      // Amplitud media respecto del silencio (128). Se escala para que hablar
      // normal llene la barra: la potencia absoluta de un microfono de telefono
      // es baja y sin escalar apenas se mueve.
      let sum = 0;
      for (const sample of samples) sum += Math.abs(sample - 128);
      setLevel(Math.min(1, sum / samples.length / 24));
      frame.current = requestAnimationFrame(tick);
    }
    frame.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame.current);
      void context.close();
    };
  }, [stream]);

  const encendidas = Math.round(level * BARS.length);

  return (
    <p className="flex items-center gap-2 text-sm text-fg-muted">
      <span className="flex items-end gap-0.5" aria-hidden="true">
        {BARS.map((bar, index) => (
          <span
            className={`w-1 rounded-full ${index < encendidas ? "bg-primary" : "bg-border"}`}
            key={bar.id}
            style={{ height: `${bar.height}px` }}
          />
        ))}
      </span>
      <span role="status">
        {stream === null
          ? "Micrófono apagado"
          : encendidas === 0
            ? "No te escucho — revisa el micrófono"
            : "Escuchando"}
      </span>
    </p>
  );
}
