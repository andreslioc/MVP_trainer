import Link from "next/link";

import { cardClasses } from "../../../components/ui/card.tsx";
import { CardGrid } from "../../../components/ui/card-grid.tsx";
import { PageSection } from "../../../components/ui/page-section.tsx";
import { getSession } from "../../../lib/auth.ts";
import { AiCostCard } from "../../../components/analytics/ai-cost-card.tsx";
import { WeeklyGoalCard } from "../../../components/goals/weekly-goal-card.tsx";
import { Card } from "../../../components/ui/card.tsx";
import { readAiCostByDay } from "../../../server/ai-cost.ts";
import { getDashboardMetrics } from "../../../server/dashboard.ts";
import { getMyCurrentWeeklyGoal } from "../../../server/weekly-goals.ts";

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
  const [result, weeklyGoal] = await Promise.all([
    getDashboardMetrics({ authorize: async () => session }),
    session.data.role === "asesor"
      ? getMyCurrentWeeklyGoal({ authorize: async () => session })
      : Promise.resolve(null),
  ]);
  // Solo para admin, igual que el acumulado: el costo es de la organizacion. Se
  // pide en paralelo con las metricas porque son dos lecturas independientes y
  // encadenarlas suma su latencia sin ninguna razon.
  const cost =
    result.ok && result.data.costUsd !== null
      ? await readAiCostByDay({ period: "semana" }, { authorize: async () => session })
      : null;

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
          {weeklyGoal?.ok ? (
            <div className="mt-8">
              <h2 className="font-display text-xl font-medium text-fg">Mi meta semanal</h2>
              <div className="mt-3">
                {weeklyGoal.data ? (
                  <WeeklyGoalCard goal={weeklyGoal.data} />
                ) : (
                  <Card>
                    <p className="font-semibold text-fg">Aún no tienes una meta asignada.</p>
                    <p className="mt-1 text-sm text-fg-muted">
                      Cuando administración defina la semana, aquí verás el avance de cada objetivo.
                    </p>
                  </Card>
                )}
              </div>
            </div>
          ) : null}
          <h2 className="mt-8 font-display text-xl font-medium text-fg">Actividad de hoy</h2>
          <CardGrid className="mt-3" columns={2}>
            <Metric
              href="/app/training"
              label="Tiempo en Training"
              value={`${result.data.todayTrainingMinutes} min`}
            />
            <Metric
              href="/app/pre-training"
              label="Tiempo en Pre-training"
              value={`${result.data.todayPretrainingMinutes} min`}
            />
          </CardGrid>

          <h2 className="mt-8 font-display text-xl font-medium text-fg">Acumulado</h2>
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

          {cost?.ok ? (
            <div className="mt-4">
              <AiCostCard report={cost.data} spanLabel="últimos 7 días" />
            </div>
          ) : null}
        </>
      )}
    </PageSection>
  );
}
