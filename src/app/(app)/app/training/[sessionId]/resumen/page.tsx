import Link from "next/link";
import { notFound } from "next/navigation";

import { getSession } from "../../../../../../lib/auth.ts";
import { getPracticeSummary } from "../../../../../../server/training/progress.ts";
import { PracticeScorecard } from "./practice-scorecard.tsx";

/**
 * Consolidado de la practica: una nota, las nueve dimensiones promediadas y el
 * detalle pregunta por pregunta.
 *
 * Es el final del recorrido lineal. La evaluacion de cada respuesta ya se vio
 * una vez y se pierde al avanzar; aqui vuelve completa, y ademas dice lo que una
 * pregunta sola no puede decir: en que dimension esta floja a lo largo de toda
 * la tanda.
 */
export default async function PracticeSummaryPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const authorization = await getSession();
  if (!authorization.ok) return null;
  const result = await getPracticeSummary(sessionId, { authorize: async () => authorization });
  if (!result.ok) notFound();

  const { session, summary } = result.data;

  return (
    <section aria-labelledby="page-title" className="max-w-4xl">
      <p className="text-sm font-semibold text-primary">
        {session.finishedAt || summary.complete ? "Práctica terminada" : "Práctica a medias"}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg" id="page-title">
        Cómo te fue: {session.title}
      </h1>
      <p className="mt-2 text-fg-muted">
        {summary.answered} de {summary.total} preguntas evaluadas
        {summary.activeMinutes > 0 ? ` · ${summary.activeMinutes} min de práctica` : null}
        {session.category ? " · fichas barajadas al azar" : null}
      </p>

      <PracticeScorecard summary={summary} />

      <div className="mt-8 flex flex-wrap gap-3">
        {summary.pending > 0 && !session.finishedAt ? (
          <Link
            className="inline-flex min-h-11 items-center rounded-card bg-primary px-5 font-semibold text-primary-fg hover:bg-primary-deep"
            href={`/app/training/${session.id}`}
          >
            Seguir con las {summary.pending} que faltan →
          </Link>
        ) : null}
        <Link
          className="inline-flex min-h-11 items-center rounded-card border border-primary px-5 font-semibold text-primary"
          href="/app/training"
        >
          Abrir otra práctica
        </Link>
      </div>
    </section>
  );
}
