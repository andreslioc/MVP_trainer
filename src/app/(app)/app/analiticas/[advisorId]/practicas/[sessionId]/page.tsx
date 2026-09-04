import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageSection } from "../../../../../../../components/ui/page-section.tsx";
import { requireRole } from "../../../../../../../lib/auth.ts";
import { getAdvisorPracticeSummary } from "../../../../../../../server/training/practice-review.ts";
import { PracticeScorecard } from "../../../../training/[sessionId]/resumen/practice-scorecard.tsx";

/**
 * Una practica concreta, vista por quien acompaña.
 *
 * Es el MISMO consolidado que ve la asesora —mismo scorecard, misma tanda,
 * mismas notas— con la voz cambiada a tercera persona. Reusarlo y no escribir
 * una pantalla paralela es a proposito: dos versiones del mismo resumen se
 * desvian, y la conversacion de acompañamiento tiene que pasar sobre lo que la
 * asesora ya vio, no sobre otra lectura de los mismos datos.
 */
export default async function AdvisorPracticeReviewPage({
  params,
}: {
  params: Promise<{ advisorId: string; sessionId: string }>;
}) {
  const { advisorId, sessionId } = await params;
  const authorization = await requireRole("supervisor");
  if (!authorization.ok) redirect("/app");

  const result = await getAdvisorPracticeSummary(
    { advisorId, sessionId },
    { authorize: async () => authorization },
  );
  if (!result.ok) notFound();
  const { advisor, session, summary } = result.data;

  return (
    <PageSection
      before={
        <Link
          className="text-sm text-primary underline"
          href={`/app/analiticas/${advisorId}/practicas`}
        >
          Volver a las prácticas
        </Link>
      }
      eyebrow={session.finishedAt || summary.complete ? "Práctica terminada" : "Práctica a medias"}
      lead={
        <>
          {summary.answered} de {summary.total} preguntas evaluadas
          {summary.activeMinutes > 0 ? ` · ${summary.activeMinutes} min de práctica` : null}
          {session.category ? " · fichas barajadas al azar" : null}
        </>
      }
      title={`${advisor.displayName}: ${session.title}`}
      width="lectura"
    >
      <PracticeScorecard summary={summary} voice="supervision" />
    </PageSection>
  );
}
