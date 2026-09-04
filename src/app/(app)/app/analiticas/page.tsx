import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, cardClasses } from "../../../../components/ui/card.tsx";
import { PageSection } from "../../../../components/ui/page-section.tsx";
import { requireRole } from "../../../../lib/auth.ts";
import { ROLE_LABELS } from "../../../../lib/roles.ts";
import { listReviewableAdvisors } from "../../../../server/training/practice-review.ts";

/**
 * Lista de personas para entrar a las analiticas de una.
 *
 * Supervision o mas: el desempeño de una asesora lo mira quien la acompaña, no
 * sus pares. El roster sale de `listReviewableAdvisors` y no del directorio de
 * cuentas: para acompañar hace falta el nombre, no el correo ni el poder de
 * cambiarle el rango.
 */
export default async function AnalyticsIndexPage() {
  const authorization = await requireRole("supervisor");
  if (!authorization.ok) redirect("/app");

  const result = await listReviewableAdvisors({ authorize: async () => authorization });

  return (
    <PageSection
      eyebrow="Seguimiento"
      lead="Elige a quién quieres ver. Cada panel muestra cuánto practicó, qué tan bien le fue y en qué dimensión conviene ayudarla."
      title="Analíticas"
      width="lectura"
    >
      {!result.ok ? (
        <Card className="mt-8" density="compacta" tone="alerta">
          <p role="alert">No se pudieron cargar las personas.</p>
        </Card>
      ) : (
        <ul className="mt-8 grid gap-2">
          {result.data.map((advisor) => (
            <li key={advisor.id}>
              <Link
                className={cardClasses({
                  density: "compacta",
                  interactive: true,
                  className: "flex items-center justify-between gap-4",
                })}
                href={`/app/analiticas/${advisor.id}`}
              >
                <span>
                  <span className="block font-semibold text-fg">{advisor.displayName}</span>
                  <span className="block text-sm text-fg-muted">
                    {ROLE_LABELS[advisor.role] ?? advisor.role} · cuenta {advisor.status}
                  </span>
                </span>
                <span className="text-sm text-fg-muted">Ver panel</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageSection>
  );
}
