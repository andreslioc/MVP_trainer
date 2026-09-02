"use client";

import { useEffect, useRef } from "react";

import { recordPracticeTimeAction } from "../actions.ts";

/** Cada cuanto se manda lo acumulado. */
const PULSE_MS = 30_000;
/**
 * Cuanto silencio convierte la practica en pestaña olvidada.
 *
 * Es el numero que hace honesto el contador: sin el, dejar la pagina abierta
 * sumaria horas. Noventa segundos alcanzan para leer una pregunta larga y
 * pensar la respuesta sin que el contador se detenga de mas.
 */
const IDLE_MS = 90_000;
const TICK_MS = 1_000;

const ACTIVITY = ["keydown", "pointerdown", "pointermove", "wheel", "focus"] as const;

/**
 * Cuenta el tiempo que la asesora realmente esta practicando.
 *
 * Suma un segundo por tick solo si la pestaña esta visible Y hubo actividad
 * dentro de la ventana de inactividad. Lo acumulado se manda cada 30 segundos
 * y tambien al salir de la pantalla, para no perder el ultimo tramo.
 *
 * No pinta nada: es un componente de comportamiento. El tiempo se ve en el
 * panel del administrador, no aca, porque un cronometro a la vista convierte
 * la practica en una carrera contra el reloj.
 */
export function PracticeTimer({ sessionId }: { sessionId: string }) {
  const pendientes = useRef(0);
  const ultimaActividad = useRef(Date.now());

  useEffect(() => {
    const marcarActividad = () => {
      ultimaActividad.current = Date.now();
    };
    for (const evento of ACTIVITY)
      window.addEventListener(evento, marcarActividad, { passive: true });

    const tick = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - ultimaActividad.current > IDLE_MS) return;
      pendientes.current += TICK_MS / 1_000;
    }, TICK_MS);

    // `void` a proposito: si un pulso se pierde, el siguiente lleva lo
    // acumulado. Perder tiempo de practica no justifica interrumpir a quien
    // esta practicando con un error en pantalla.
    const enviar = () => {
      const segundos = Math.floor(pendientes.current);
      if (segundos < 1) return;
      pendientes.current -= segundos;
      void recordPracticeTimeAction({ sessionId, seconds: segundos });
    };

    const pulso = window.setInterval(enviar, PULSE_MS);
    // Al ocultarse la pestaña se manda lo que haya: si el navegador la
    // descarta despues, ese tramo ya quedo guardado.
    document.addEventListener("visibilitychange", enviar);

    return () => {
      window.clearInterval(tick);
      window.clearInterval(pulso);
      document.removeEventListener("visibilitychange", enviar);
      for (const evento of ACTIVITY) window.removeEventListener(evento, marcarActividad);
      enviar();
    };
  }, [sessionId]);

  return null;
}
