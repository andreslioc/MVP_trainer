import Link from "next/link";

import { getSession } from "../../../../lib/auth.ts";
import { listTrainingCategories } from "../../../../server/training/categories.ts";
import { listTrainingProducts } from "../../../../server/training/questions.ts";
import { TrainingLauncher } from "./training-launcher.tsx";

export default async function TrainingPage() {
  const session = await getSession();
  if (!session.ok) return null;
  const [result, fichas] = await Promise.all([
    listTrainingCategories({ authorize: async () => session }),
    listTrainingProducts({ authorize: async () => session }),
  ]);

  return (
    <section aria-labelledby="page-title" className="max-w-5xl">
      <p className="text-sm font-semibold text-primary">Antes del live</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg" id="page-title">
        Training Simulator
      </h1>
      <p className="mt-2 max-w-2xl text-fg-muted">
        Elige una categoría y responde preguntas reales de clientas sobre fichas verificadas del
        Knowledge Hub, barajadas al azar como en un live.
      </p>

      {!result.ok ? (
        <div className="mt-8 rounded-card border border-destructive bg-confidence-low-bg p-4">
          <p className="font-semibold text-confidence-low-fg" role="alert">
            No se pudieron cargar las categorías de práctica.
          </p>
          <Link
            className="mt-2 inline-block font-semibold text-primary underline"
            href="/app/training"
          >
            Reintentar
          </Link>
        </div>
      ) : result.data.length === 0 ? (
        <div className="mt-8 rounded-card border border-border bg-surface p-6">
          <h2 className="text-xl font-semibold text-fg">Todavía no hay fichas verificadas</h2>
          <p className="mt-2 max-w-xl text-fg-muted">
            Una administradora debe verificar al menos una ficha antes de generar preguntas o abrir
            una práctica.
          </p>
        </div>
      ) : (
        <>
          <TrainingLauncher categories={result.data} products={fichas.ok ? fichas.data : []} />
          <div className="mt-6 max-w-xl rounded-card border border-border bg-surface p-5">
            <h2 className="text-xl font-semibold text-fg">O practica con el chat corriendo</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Te ves en cámara, el chat pasa solo con comentarios y preguntas de varias fichas, y
              contestas en voz alta. Se mide qué alcanzaste a responder y cómo lo respondiste.
            </p>
            <Link
              className="mt-4 inline-flex min-h-11 items-center rounded-card border border-primary px-4 font-semibold text-primary"
              href="/app/training/simulacro"
            >
              Abrir simulacro de live
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
