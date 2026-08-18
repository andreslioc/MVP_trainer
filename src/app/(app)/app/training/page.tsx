import Link from "next/link";

import { getSession } from "../../../../lib/auth.ts";
import { listTrainingProducts } from "../../../../server/training/questions.ts";
import { TrainingLauncher } from "./training-launcher.tsx";

export default async function TrainingPage() {
  const session = await getSession();
  if (!session.ok) return null;
  const result = await listTrainingProducts({ authorize: async () => session });

  return (
    <section aria-labelledby="page-title" className="max-w-5xl">
      <p className="text-sm font-semibold text-primary">Antes del live</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg" id="page-title">
        Training Simulator
      </h1>
      <p className="mt-2 max-w-2xl text-fg-muted">
        Practica preguntas reales de clientas usando únicamente fichas verificadas del Knowledge
        Hub.
      </p>

      {!result.ok ? (
        <div className="mt-8 rounded-card border border-destructive bg-confidence-low-bg p-4">
          <p className="font-semibold text-confidence-low-fg" role="alert">
            No se pudieron cargar los productos de práctica.
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
        <TrainingLauncher products={result.data} />
      )}
    </section>
  );
}
