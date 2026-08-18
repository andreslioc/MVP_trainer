import Link from "next/link";

import { getSession } from "../../../lib/auth.ts";
import { getDashboardMetrics } from "../../../server/dashboard.ts";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function Metric({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <Link
      className="rounded-card border border-border bg-surface p-5 transition hover:border-primary"
      href={href}
    >
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
    <section aria-labelledby="page-title" className="max-w-5xl">
      <p className="text-sm font-semibold text-primary">Inicio</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg" id="page-title">
        Tu centro de trabajo
      </h1>

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
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          </div>
        </>
      )}
    </section>
  );
}
