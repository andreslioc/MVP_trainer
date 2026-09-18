import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card } from "../../../../../components/ui/card.tsx";
import { CardGrid } from "../../../../../components/ui/card-grid.tsx";
import { PageSection } from "../../../../../components/ui/page-section.tsx";
import { PERIOD_LABELS, PERIOD_SPAN, parsePeriod } from "../../../../../lib/analytics-period.ts";
import { requireRole } from "../../../../../lib/auth.ts";
import { ROLE_LABELS } from "../../../../../lib/roles.ts";
import { getAdvisorAnalytics } from "../../../../../server/advisor-analytics.ts";
import { DimensionTable } from "../dimension-table.tsx";
import { MetricCard } from "../metric-card.tsx";
import { UsageTimeline } from "../../../../../components/analytics/usage-timeline.tsx";
import { PeriodTabs } from "../period-tabs.tsx";
import { ProgressSummary } from "../progress-summary.tsx";
import { ScoreMeter } from "../score-meter.tsx";
import { Sparkline } from "../sparkline.tsx";

export default async function AdvisorAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ advisorId: string }>;
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { advisorId } = await params;
  const period = parsePeriod((await searchParams).periodo);
  const authorization = await requireRole("supervisor");
  if (!authorization.ok) redirect("/app");

  const result = await getAdvisorAnalytics(
    { advisorId, period },
    { authorize: async () => authorization },
  );
  if (!result.ok) notFound();
  const data = result.data;
  const ventana = PERIOD_LABELS[data.period];
  const enLaVentana = PERIOD_SPAN[data.period];

  // Con "todo" las columnas se quedan en 30 dias aunque los numeros abarquen
  // todo el historial. Decirlo evita que el grafico se lea como el total.
  const notaColumnas = data.period === "todo" ? "Últimos 30 días" : ventana;

  return (
    <PageSection
      before={
        <Link className="text-sm text-primary underline" href="/app/analiticas">
          Volver a la lista
        </Link>
      }
      lead={
        <>
          {ROLE_LABELS[data.advisor.role] ?? data.advisor.role} · cuenta {data.advisor.status}
        </>
      }
      title={data.advisor.displayName}
      width="panel"
    >
      <PeriodTabs advisorId={advisorId} period={data.period} />

      <h2 className="mt-8 font-display text-xl font-medium text-fg">Resumen de progreso</h2>
      <p className="mt-1 max-w-3xl text-sm text-fg-muted">
        Compara desempeño contra el periodo anterior y señala una mejora comprobable y la prioridad
        que todavía necesita acompañamiento.
      </p>
      <ProgressSummary progress={data.progress} />

      <h2 className="mt-10 font-display text-xl font-medium text-fg">Tiempo de uso</h2>
      <p className="mt-1 max-w-3xl text-sm text-fg-muted">
        Tiempo activo, no pestañas abiertas: Pre-training se pausa al dejar de leer y Training al
        dejar de practicar.
      </p>
      <CardGrid className="mt-4" columns={4}>
        <MetricCard
          label="Tiempo de aprendizaje"
          note={`${ventana} · dos módulos medidos`}
          unit="min"
          value={String(data.totalLearningMinutes)}
        />
        <MetricCard
          label="Training"
          note={`${data.practiceMinutes} min ${enLaVentana}`}
          unit="min"
          value={String(data.practiceMinutes)}
        />
        <MetricCard
          label="Pre-training"
          note={
            data.productsStudied === 1
              ? "1 ficha estudiada"
              : `${data.productsStudied} fichas estudiadas`
          }
          unit="min"
          value={String(data.pretrainingMinutes)}
        />
        <MetricCard
          label="Días con actividad"
          note={notaColumnas}
          value={String(data.activeDays)}
        />
      </CardGrid>
      <Card className="mt-4" density="compacta">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-lg font-medium text-fg">Línea de tiempo</h3>
          <p className="text-xs text-fg-muted">Minutos activos por día · {notaColumnas}</p>
        </div>
        <div className="mt-4">
          <UsageTimeline data={data.usageByDay} />
        </div>
      </Card>

      <h2 className="mt-10 font-display text-xl font-medium text-fg">Evolución del desempeño</h2>
      <p className="mt-1 max-w-3xl text-sm text-fg-muted">
        El tiempo dice cuánto entrenó; las respuestas evaluadas muestran si ese esfuerzo se está
        convirtiendo en mejores respuestas.
      </p>
      <div className="mt-4">
        <ScoreMeter
          answersToCalibrate={data.answersToCalibrate}
          calibrating={data.calibrating}
          percent={data.accuracyPercent}
        />
      </div>

      <CardGrid className="mt-4" columns={4}>
        <MetricCard
          label="Respuestas evaluadas"
          note={`Con nota · ${ventana}`}
          value={String(data.answers)}
        >
          <Sparkline
            data={data.answerHistory.map((punto) => ({ key: punto.day, value: punto.total }))}
            label="Respuestas acumuladas"
          />
        </MetricCard>
        <MetricCard
          label="Fichas practicadas"
          note="Productos distintos"
          value={String(data.productsPracticed)}
        />
        <MetricCard label="Prácticas" note={ventana} value={String(data.practicesStarted)} />
        <MetricCard
          label="Prácticas terminadas"
          note={`de ${data.practicesStarted} empezadas`}
          value={String(data.practicesFinished)}
        />
      </CardGrid>

      <h2 className="mt-10 font-display text-xl font-medium text-fg">Qué conviene entrenar</h2>
      <p className="mt-1 max-w-2xl text-sm text-fg-muted">
        De lo más flojo a lo más sólido, sobre la rúbrica de 1 a 5 que califica cada respuesta,{" "}
        {enLaVentana}. Lo primero de la lista es donde más rinde una sesión de acompañamiento.
      </p>
      {data.dimensions.length === 0 ? (
        <Card className="mt-4" density="compacta">
          <p className="text-fg-muted">
            Sin respuestas calificadas en esta ventana. Prueba con una más amplia.
          </p>
        </Card>
      ) : (
        <DimensionTable dimensions={data.dimensions} />
      )}
      <p className="mt-4">
        <Link
          className="inline-flex min-h-11 items-center rounded-card border border-primary px-5 font-semibold text-primary"
          href={`/app/analiticas/${advisorId}/practicas`}
        >
          Ver sus prácticas una por una →
        </Link>
      </p>
      <p className="mt-2 max-w-2xl text-sm text-fg-muted">
        La tabla dice en qué dimensión está floja; las prácticas dicen qué contestó.
      </p>

      <h2 className="mt-10 font-display text-xl font-medium text-fg">En vivo</h2>
      <CardGrid className="mt-3" columns={3}>
        <MetricCard label="Lives" value={String(data.liveSessions)} />
        <MetricCard label="Respuestas del Copilot" value={String(data.copilotAnswers)} />
        <MetricCard
          label="Alertas en vivo"
          note={`en ${data.copilotAnswers} respuestas del Copilot`}
          value={String(data.copilotAlerts)}
        />
      </CardGrid>
    </PageSection>
  );
}
