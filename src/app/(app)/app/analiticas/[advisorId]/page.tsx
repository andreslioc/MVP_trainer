import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PERIOD_LABELS, PERIOD_SPAN, parsePeriod } from "../../../../../lib/analytics-period.ts";
import { requireRole } from "../../../../../lib/auth.ts";
import { ROLE_LABELS } from "../../../../../lib/roles.ts";
import { getAdvisorAnalytics } from "../../../../../server/advisor-analytics.ts";
import { DimensionTable } from "../dimension-table.tsx";
import { MetricCard } from "../metric-card.tsx";
import { MiniColumns } from "../mini-columns.tsx";
import { PeriodTabs } from "../period-tabs.tsx";
import { ScoreMeter } from "../score-meter.tsx";
import { Sparkline } from "../sparkline.tsx";

const nombresDeDia = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
export default async function AdvisorAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ advisorId: string }>;
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { advisorId } = await params;
  const period = parsePeriod((await searchParams).periodo);
  const authorization = await requireRole("admin");
  if (!authorization.ok) redirect("/app");

  const result = await getAdvisorAnalytics(
    { advisorId, period },
    { authorize: async () => authorization },
  );
  if (!result.ok) notFound();
  const data = result.data;
  const ventana = PERIOD_LABELS[data.period];
  const enLaVentana = PERIOD_SPAN[data.period];

  // Todos los dias de la ventana, incluidos los vacios: un calendario con
  // huecos se cuenta de un vistazo, uno con dias omitidos miente sobre la
  // constancia. Las claves vienen del servidor, ya en la zona del negocio.
  const dias = data.windowDays.map((clave) => {
    const fecha = new Date(`${clave}T12:00:00Z`);
    const registro = data.activityByDay.find((item) => item.day === clave);
    return {
      key: clave,
      label: `${nombresDeDia[fecha.getUTCDay()] ?? ""} ${fecha.getUTCDate()}`,
      practices: registro?.practices ?? 0,
      minutes: registro?.minutes ?? 0,
    };
  });
  const practicasVentana = dias.reduce((total, dia) => total + dia.practices, 0);
  const minutosVentana = dias.reduce((total, dia) => total + dia.minutes, 0);
  // Con "todo" las columnas se quedan en 30 dias aunque los numeros abarquen
  // todo el historial. Decirlo evita que el grafico se lea como el total.
  const notaColumnas = data.period === "todo" ? "Últimos 30 días" : ventana;

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

      <PeriodTabs advisorId={advisorId} period={data.period} />

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <MetricCard label="Prácticas" note={notaColumnas} value={String(practicasVentana)}>
          <MiniColumns
            data={dias.map((dia) => ({ key: dia.key, value: dia.practices, label: dia.label }))}
            label={`Prácticas por día · ${notaColumnas}`}
            unit="prácticas"
          />
        </MetricCard>
        <MetricCard
          label="Tiempo practicado"
          note={`${data.practiceMinutes} min ${enLaVentana}`}
          unit="min"
          value={String(minutosVentana)}
        >
          <MiniColumns
            data={dias.map((dia) => ({ key: dia.key, value: dia.minutes, label: dia.label }))}
            label={`Minutos practicados por día · ${notaColumnas}`}
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
        De lo más flojo a lo más sólido, sobre la rúbrica de 1 a 5 que califica cada respuesta,{" "}
        {enLaVentana}. Lo primero de la lista es donde más rinde una sesión de acompañamiento.
      </p>
      {data.dimensions.length === 0 ? (
        <p className="mt-4 rounded-card border border-border bg-surface p-4 text-fg-muted">
          Sin respuestas calificadas en esta ventana. Prueba con una más amplia.
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
