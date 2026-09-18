"use client";

import { useCallback } from "react";

import { ActiveTimeTracker } from "../../../../../components/activity/active-time-tracker.tsx";
import { recordPretrainingTimeAction } from "../actions.ts";

/** Registra estudio activo sin mostrar un cronometro que convierta la lectura en carrera. */
export function PretrainingTimer({ productId }: { productId: string }) {
  const sendPulse = useCallback(
    (seconds: number) => recordPretrainingTimeAction({ productId, seconds }),
    [productId],
  );

  return <ActiveTimeTracker sendPulse={sendPulse} />;
}
