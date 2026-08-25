"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { researchProductAction } from "./actions.ts";

/**
 * Rearma el contenido de la ficha con busqueda web.
 *
 * Vive en su propia hoja cliente para que la cuadricula del Hub siga siendo un
 * Server Component: la pagina renderiza 90 tarjetas y no necesita hidratar
 * ninguna, solo este boton.
 */
export function ResearchButton({ productId, verified }: { productId: string; verified: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();

  async function run() {
    // La ficha verificada pierde su sello al regenerarse: lo que alguien aprobo
    // deja de ser lo que esta guardado. Se avisa antes, no despues.
    if (
      verified &&
      !window.confirm(
        "Esta ficha está verificada. Regenerarla la deja como “Por verificar” hasta que alguien la revise. ¿Continuar?",
      )
    ) {
      return;
    }
    setPending(true);
    setFeedback(undefined);
    const result = await researchProductAction(productId);
    if (result.ok) {
      setFeedback({
        type: "success",
        message: `Ficha rearmada con ${result.data.sources} ${
          result.data.sources === 1 ? "fuente" : "fuentes"
        }. Queda por verificar.`,
      });
      router.refresh();
    } else {
      setFeedback({ type: "error", message: result.error.message });
    }
    setPending(false);
  }

  return (
    <div>
      <button
        className="inline-flex min-h-11 items-center rounded-card border border-border-control px-3 font-semibold text-primary-deep disabled:opacity-60"
        disabled={pending}
        onClick={run}
        type="button"
      >
        {pending ? "Buscando en internet…" : "Investigar con búsqueda"}
      </button>
      {feedback ? (
        <p
          className={`mt-2 text-sm ${
            feedback.type === "success" ? "text-confidence-high-fg" : "text-confidence-low-fg"
          }`}
          role={feedback.type === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
