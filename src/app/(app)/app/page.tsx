import Link from "next/link";

import { cardClasses } from "../../../components/ui/card.tsx";
import { CardGrid } from "../../../components/ui/card-grid.tsx";
import { PageSection } from "../../../components/ui/page-section.tsx";
import { getSession } from "../../../lib/auth.ts";
import { getDashboardMetrics } from "../../../server/dashboard.ts";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function Metric({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    // La tarjeta ES el enlace: `cardClasses` la viste sin envolverla en un div,
    // que dejaria el area de clic mas chica que la tarjeta.
    <Link className={cardClasses({ interactive: true })} href={href}>
      <p className="text-sm text-fg-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-fg">{value}</p>
    </Link>
  );
}

export default async function AppPage() {
  const session = await getSession();
  if (!session.ok) return null;
  const result = await getDashboardMetrics({ authorize: async () => session });

  return (
    <PageSection eyebrow="Inicio" title="Tu centro de trabajo" width="panel">
      {!result.ok ? (
        <p
          className="mt-8 rounded-card border border-destructive bg-confidence-low-bg p-4 font-semibold text-confidence-low-fg"
          role="alert"
        >
          No se pudieron calcular las métricas.
        </p>
      ) : (
        <>
          <p className="mt-2 max-w-2xl text-fg-muted">
            {result.data.scope === "organizacion"
              ? "Agregados de toda la organización."
              : "Solo tus números: nadie más los ve, y tú no ves los de las demás."}
          </p>
          <CardGrid className="mt-8" columns={3}>
            <Metric
              href="/app/training"
              label="Prácticas realizadas"
              value={String(result.data.trainingSessions)}
            />
            <Metric
              href="/app/training"
              label="Respuestas evaluadas"
              value={String(result.data.answers)}
            />
            <Metric
              href="/app/copilot"
              label="Lives asistidos"
              value={String(result.data.liveSessions)}
            />
            <Metric
              href="/app/copilot"
              label="Respuestas del Copilot"
              value={String(result.data.copilotAnswers)}
            />
            <Metric
              href="/app/intelligence"
              label="Grabaciones analizadas"
              value={String(result.data.recordingsAnalyzed)}
            />
            <Metric
              href="/app/intelligence"
              label="Hallazgos"
              value={String(result.data.insights)}
            />
            {result.data.costUsd === null ? null : (
              <Metric
                href="/app/settings"
                label="Costo de IA acumulado"
                value={currency.format(result.data.costUsd)}
              />
            )}
          </CardGrid>
        </>
      )}
    </PageSection>
  );
}
