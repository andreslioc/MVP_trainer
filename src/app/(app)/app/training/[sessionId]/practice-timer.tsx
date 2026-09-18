"use client";

import { useCallback } from "react";

import { ActiveTimeTracker } from "../../../../../components/activity/active-time-tracker.tsx";
import { recordPracticeTimeAction } from "../actions.ts";

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
  const sendPulse = useCallback(
    (seconds: number) => recordPracticeTimeAction({ sessionId, seconds }),
    [sessionId],
  );

  return <ActiveTimeTracker sendPulse={sendPulse} />;
}
