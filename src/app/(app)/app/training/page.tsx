import Link from "next/link";

import { Card } from "../../../../components/ui/card.tsx";
import { PageSection } from "../../../../components/ui/page-section.tsx";
import { getSession } from "../../../../lib/auth.ts";
import { listTrainingCategories } from "../../../../server/training/categories.ts";
import { listOpenPractices } from "../../../../server/training/progress.ts";
import { listTrainingProducts } from "../../../../server/training/questions.ts";
import { OpenPractices } from "./open-practices.tsx";
import { TrainingLauncher } from "./training-launcher.tsx";

export default async function TrainingPage() {
  const session = await getSession();
  if (!session.ok) return null;
  const [result, fichas, abiertas] = await Promise.all([
    listTrainingCategories({ authorize: async () => session }),
    listTrainingProducts({ authorize: async () => session }),
    listOpenPractices({ authorize: async () => session }),
  ]);

  return (
    <PageSection
      eyebrow="Antes del live"
      lead="Elige una categoría y responde preguntas reales de clientas sobre fichas verificadas del Knowledge Hub, barajadas al azar como en un live."
      title="Training Simulator"
      width="panel"
    >
      {abiertas.ok ? <OpenPractices practices={abiertas.data} /> : null}

      {!result.ok ? (
        <Card className="mt-8" density="compacta" tone="alerta">
          <p className="font-semibold" role="alert">
            No se pudieron cargar las categorías de práctica.
          </p>
          <Link
            className="mt-2 inline-block font-semibold text-primary underline"
            href="/app/training"
          >
            Reintentar
          </Link>
        </Card>
      ) : result.data.length === 0 ? (
        <Card className="mt-8">
          <h2 className="font-display text-xl font-medium text-fg">
            Todavía no hay fichas verificadas
          </h2>
          <p className="mt-2 max-w-xl text-fg-muted">
            Una administradora debe verificar al menos una ficha antes de generar preguntas o abrir
            una práctica.
          </p>
        </Card>
      ) : (
        <>
          <TrainingLauncher categories={result.data} products={fichas.ok ? fichas.data : []} />
          <Card className="mt-6 max-w-xl">
            <h2 className="font-display text-xl font-medium text-fg">
              O practica con el chat corriendo
            </h2>
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
          </Card>
        </>
      )}
    </PageSection>
  );
}
