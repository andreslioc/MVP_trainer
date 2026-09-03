"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { finishPracticeNowAction } from "../actions.ts";

/**
 * Cierra la practica antes de terminar la tanda y manda al consolidado.
 *
 * No es un "cancelar": lo respondido cuenta y aparece en el resumen. Existe
 * porque entra un live, se acaba el tiempo, y sin esta salida la sesion se
 * quedaba abierta para siempre sin resumen que mostrar.
 */
export function FinishPracticeButton({
  sessionId,
  summaryHref,
  answered,
}: {
  sessionId: string;
  summaryHref: string;
  /** Con cero respondidas no hay consolidado que dar, y el boton lo dice. */
  answered: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function finish() {
    setPending(true);
    setError(undefined);
    const result = await finishPracticeNowAction(sessionId);
    if (result.ok) {
      router.push(summaryHref);
      return;
    }
    setError(result.error.message);
    setPending(false);
  }

  return (
    <div>
      <button
        className="min-h-11 rounded-card border border-border-control bg-surface px-4 font-semibold text-primary-deep disabled:opacity-60"
        disabled={pending}
        onClick={finish}
        type="button"
      >
        {pending
          ? "Cerrando…"
          : answered === 0
            ? "Cerrar sin responder"
            : "Terminar aquí y ver resumen"}
      </button>
      {error ? (
        <p className="mt-2 text-sm text-confidence-low-fg" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
