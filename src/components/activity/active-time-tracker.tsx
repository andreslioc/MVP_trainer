"use client";

import { useEffect } from "react";

/** Cada cuanto se manda lo acumulado. */
const PULSE_MS = 30_000;
/** Leer sin tocar la pantalla cuenta; despues de este silencio se pausa. */
const IDLE_MS = 90_000;
const TICK_MS = 1_000;

const ACTIVITY = ["keydown", "pointerdown", "pointermove", "wheel", "focus"] as const;

/**
 * Contador invisible compartido por Training y Pre-training.
 *
 * Suma solo con la pagina visible y actividad reciente. El destino del pulso
 * lo decide el envoltorio de cada modulo, por lo que este componente no conoce
 * la base ni importa codigo de servidor.
 */
export function ActiveTimeTracker({
  sendPulse,
}: {
  sendPulse: (seconds: number) => Promise<unknown>;
}) {
  useEffect(() => {
    let pendingSeconds = 0;
    let lastActivity = Date.now();

    const markActivity = () => {
      lastActivity = Date.now();
    };
    for (const event of ACTIVITY) window.addEventListener(event, markActivity, { passive: true });

    const tick = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivity > IDLE_MS) return;
      pendingSeconds += TICK_MS / 1_000;
    }, TICK_MS);

    // Se resta antes de despachar para que visibilitychange y el desmontaje,
    // si ocurren juntos, no manden dos veces el mismo tramo.
    const send = () => {
      const seconds = Math.floor(pendingSeconds);
      if (seconds < 1) return;
      pendingSeconds -= seconds;
      void sendPulse(seconds);
    };

    const pulse = window.setInterval(send, PULSE_MS);
    document.addEventListener("visibilitychange", send);
    window.addEventListener("pagehide", send);

    return () => {
      window.clearInterval(tick);
      window.clearInterval(pulse);
      document.removeEventListener("visibilitychange", send);
      window.removeEventListener("pagehide", send);
      for (const event of ACTIVITY) window.removeEventListener(event, markActivity);
      send();
    };
  }, [sendPulse]);

  return null;
}
