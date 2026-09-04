import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, cardClasses } from "../../../../../../components/ui/card.tsx";
import { PageSection } from "../../../../../../components/ui/page-section.tsx";
import { BUSINESS_TIMEZONE } from "../../../../../../lib/analytics-period.ts";
import { requireRole } from "../../../../../../lib/auth.ts";
import { ROLE_LABELS } from "../../../../../../lib/roles.ts";
import {
  PRACTICE_REVIEW_LIMIT,
  listAdvisorPractices,
} from "../../../../../../server/training/practice-review.ts";

/**
 * El historial de practicas de una asesora, para quien la acompaña.
 *
 * Las analiticas dicen EN QUE dimension esta floja; esta lista es el camino a
 * la pregunta concreta donde se vio. Una sin la otra deja el seguimiento a
 * medias: un 2.8 en "manejo de objeciones" no dice que se le contesto a la
 * clienta.
 */

const formatter = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  // La zona explicita: el servidor corre en UTC y una practica de las siete de
  // la noche en Colombia se leeria con la fecha del dia siguiente.
  timeZone: BUSINESS_TIMEZONE,
});

export default async function AdvisorPracticesPage({
  params,
}: {
  params: Promise<{ advisorId: string }>;
}) {
  const { advisorId } = await params;
  const authorization = await requireRole("supervisor");
  if (!authorization.ok) redirect("/app");

  const result = await listAdvisorPractices(
    { advisorId },
    { authorize: async () => authorization },
  );
  if (!result.ok) notFound();
  const { advisor, practices } = result.data;

  return (
    <PageSection
      before={
        <Link className="text-sm text-primary underline" href={`/app/analiticas/${advisorId}`}>
          Volver a las analíticas
        </Link>
      }
      lead={
        <>
          {ROLE_LABELS[advisor.role] ?? advisor.role} · las {PRACTICE_REVIEW_LIMIT} más recientes
        </>
      }
      title={`Prácticas de ${advisor.displayName}`}
      width="lectura"
    >
      {practices.length === 0 ? (
        <Card className="mt-6" density="compacta">
          <p className="text-fg-muted">Todavía no ha abierto ninguna práctica.</p>
        </Card>
      ) : (
        <ul className="mt-6 space-y-3">
          {practices.map((practice) => (
            <li key={practice.id}>
              <Link
                className={cardClasses({
                  density: "compacta",
                  interactive: true,
                  className: "block",
                })}
                href={`/app/analiticas/${advisorId}/practicas/${practice.id}`}
              >
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong className="font-semibold text-fg">{practice.title}</strong>
                  <span className="text-sm tabular-nums text-fg-muted">
                    {formatter.format(practice.startedAt)}
                  </span>
                </span>
                <span className="mt-1 block text-sm text-fg-muted">
                  {practice.answered} respuestas evaluadas ·{" "}
                  {practice.finishedAt ? "terminada" : "a medias"}
                  {practice.activeSeconds > 0
                    ? ` · ${Math.round(practice.activeSeconds / 60)} min`
                    : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageSection>
  );
}
