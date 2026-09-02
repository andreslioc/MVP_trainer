import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireRole } from "../../../../../lib/auth.ts";
import { ROLE_LABELS } from "../../../../../lib/roles.ts";
import { getAdvisorAnalytics } from "../../../../../server/advisor-analytics.ts";
import { DimensionTable } from "../dimension-table.tsx";
import { MetricCard } from "../metric-card.tsx";
import { MiniColumns } from "../mini-columns.tsx";
import { ScoreMeter } from "../score-meter.tsx";
import { Sparkline } from "../sparkline.tsx";

const nombresDeDia = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
export default async function AdvisorAnalyticsPage({
  params,
}: {
  params: Promise<{ advisorId: string }>;
}) {
  const { advisorId } = await params;
  const authorization = await requireRole("admin");
  if (!authorization.ok) redirect("/app");

  const result = await getAdvisorAnalytics({ advisorId }, { authorize: async () => authorization });
  if (!result.ok) notFound();
  const data = result.data;

  // Los siete dias siempre completos, incluidos los vacios.
  const hoy = new Date();
  const semana = Array.from({ length: 7 }, (_, index) => {
    const fecha = new Date(hoy);
    fecha.setDate(hoy.getDate() - (6 - index));
    const clave = fecha.toISOString().slice(0, 10);
    const registro = data.activityByDay.find((item) => item.day === clave);
    return {
      key: clave,
      label: `${nombresDeDia[fecha.getDay()] ?? ""} ${fecha.getDate()}`,
      practices: registro?.practices ?? 0,
      minutes: registro?.minutes ?? 0,
    };
  });
  const practicasSemana = semana.reduce((total, dia) => total + dia.practices, 0);
  const minutosSemana = semana.reduce((total, dia) => total + dia.minutes, 0);

  return (
    <section aria-labelledby="page-title" className="max-w-5xl">
      <Link className="text-sm text-primary underline" href="/app/analiticas">
        Volver a la lista
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg" id="page-title">
        {data.advisor.displayName}
      </h1>
      <p className="mt-2 text-fg-muted">
        {ROLE_LABELS[data.advisor.role] ?? data.advisor.role} · cuenta {data.advisor.status}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <MetricCard
          label="Prácticas esta semana"
          note="Últimos siete días"
          value={String(practicasSemana)}
        >
          <MiniColumns
            data={semana.map((dia) => ({ key: dia.key, value: dia.practices, label: dia.label }))}
            label="Prácticas por día en los últimos siete días"
            unit="prácticas"
          />
        </MetricCard>
        <MetricCard
          label="Tiempo practicado esta semana"
          note={`${data.practiceMinutes} min en total`}
          unit="min"
          value={String(minutosSemana)}
        >
          <MiniColumns
            data={semana.map((dia) => ({ key: dia.key, value: dia.minutes, label: dia.label }))}
            label="Minutos practicados por día en los últimos siete días"
            unit="minutos"
          />
        </MetricCard>
      </div>

      <div className="mt-4">
        <ScoreMeter
          answersToCalibrate={data.answersToCalibrate}
          calibrating={data.calibrating}
          percent={data.accuracyPercent}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Respuestas evaluadas" value={String(data.answers)}>
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
        <MetricCard
          label="Prácticas terminadas"
          note={`de ${data.practicesStarted} empezadas`}
          value={String(data.practicesFinished)}
        />
        <MetricCard
          label="Alertas en vivo"
          note={`en ${data.copilotAnswers} respuestas del Copilot`}
          value={String(data.copilotAlerts)}
        />
      </div>

      <h2 className="mt-10 text-xl font-semibold text-fg">Qué conviene entrenar</h2>
      <p className="mt-1 max-w-2xl text-sm text-fg-muted">
        De lo más flojo a lo más sólido, sobre la rúbrica de 1 a 5 que califica cada respuesta. Lo
        primero de la lista es donde más rinde una sesión de acompañamiento.
      </p>
      {data.dimensions.length === 0 ? (
        <p className="mt-4 rounded-card border border-border bg-surface p-4 text-fg-muted">
          Aparece cuando complete su primera práctica evaluada.
        </p>
      ) : (
        <DimensionTable dimensions={data.dimensions} />
      )}

      <h2 className="mt-10 text-xl font-semibold text-fg">En vivo</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <MetricCard label="Lives" value={String(data.liveSessions)} />
        <MetricCard label="Respuestas del Copilot" value={String(data.copilotAnswers)} />
      </div>
    </section>
  );
}
