import { WEEKLY_GOAL_STATUS_LABELS, type WeeklyGoalProgress } from "../../lib/weekly-goals.ts";
import { Card } from "../ui/card.tsx";

const statusClasses: Record<WeeklyGoalProgress["status"], string> = {
  sin_iniciar: "border-border bg-surface-sunken text-fg-muted",
  en_progreso: "border-warning-border bg-confidence-mid-bg text-confidence-mid-fg",
  cumplida: "border-confidence-high-border bg-confidence-high-bg text-confidence-high-fg",
  vencida: "border-destructive bg-confidence-low-bg text-confidence-low-fg",
};

function Metric({
  label,
  metric,
  unit,
}: {
  label: string;
  metric: { current: number; target: number };
  unit: string;
}) {
  if (metric.target === 0) return null;
  const percentage = Math.min(Math.round((metric.current / metric.target) * 100), 100);
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-fg">{label}</span>
        <span className="tabular-nums text-fg-muted">
          {metric.current} de {metric.target} {unit}
        </span>
      </div>
      <div
        aria-label={`${label}: ${metric.current} de ${metric.target}`}
        aria-valuemax={metric.target}
        aria-valuemin={0}
        aria-valuenow={Math.min(metric.current, metric.target)}
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-sunken"
        role="progressbar"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

export function WeeklyGoalCard({
  goal,
  showName = false,
}: {
  goal: WeeklyGoalProgress;
  showName?: boolean;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {showName ? <h3 className="font-semibold text-fg">{goal.displayName}</h3> : null}
          <p className={showName ? "mt-1 text-sm text-fg-muted" : "text-sm text-fg-muted"}>
            {goal.weekStart} al {goal.weekEnd}
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[goal.status]}`}
        >
          {WEEKLY_GOAL_STATUS_LABELS[goal.status]} · {goal.percentage}%
        </span>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <Metric label="Training" metric={goal.training} unit="sesiones" />
        <Metric label="Pre-training" metric={goal.pretraining} unit="min" />
        <Metric label="Fichas estudiadas" metric={goal.products} unit="fichas" />
      </div>
    </Card>
  );
}
