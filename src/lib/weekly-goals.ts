import { businessToday, shiftBusinessDay } from "./analytics-period.ts";

export const BOGOTA_OFFSET = "-05:00";

export type WeeklyGoalStatus = "sin_iniciar" | "en_progreso" | "cumplida" | "vencida";

export type WeeklyGoalMetric = {
  current: number;
  target: number;
};

export type WeeklyGoalProgress = {
  advisorId: string;
  displayName: string;
  weekStart: string;
  weekEnd: string;
  status: WeeklyGoalStatus;
  percentage: number;
  training: WeeklyGoalMetric;
  pretraining: WeeklyGoalMetric;
  products: WeeklyGoalMetric;
};

export type WeeklyGoalRow = WeeklyGoalProgress & { hasGoal: boolean };

export function weekStartFor(now: Date = new Date()): string {
  const today = businessToday(now);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  return shiftBusinessDay(today, -(weekday === 0 ? 6 : weekday - 1));
}

export function isMonday(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const parsed = new Date(`${day}T12:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === day &&
    parsed.getUTCDay() === 1
  );
}

export function weekBounds(weekStart: string) {
  return {
    weekStart,
    weekEnd: shiftBusinessDay(weekStart, 6),
    nextWeekStart: shiftBusinessDay(weekStart, 7),
    startInstant: new Date(`${weekStart}T00:00:00${BOGOTA_OFFSET}`),
    endInstant: new Date(`${shiftBusinessDay(weekStart, 7)}T00:00:00${BOGOTA_OFFSET}`),
  };
}

export function weeklyGoalStatus(
  metrics: Pick<WeeklyGoalProgress, "training" | "pretraining" | "products">,
  weekStart: string,
  now: Date = new Date(),
): Pick<WeeklyGoalProgress, "status" | "percentage"> {
  const configured = [metrics.training, metrics.pretraining, metrics.products].filter(
    (metric) => metric.target > 0,
  );
  if (configured.length === 0) return { status: "sin_iniciar", percentage: 0 };
  const completed = configured.every((metric) => metric.current >= metric.target);
  const percentage = Math.round(
    configured.reduce((sum, metric) => sum + Math.min(metric.current / metric.target, 1) * 100, 0) /
      configured.length,
  );

  if (completed) return { status: "cumplida", percentage: 100 };
  if (weekStart < weekStartFor(now)) return { status: "vencida", percentage };
  if (configured.every((metric) => metric.current === 0)) {
    return { status: "sin_iniciar", percentage: 0 };
  }
  return { status: "en_progreso", percentage };
}

export const WEEKLY_GOAL_STATUS_LABELS: Record<WeeklyGoalStatus, string> = {
  sin_iniciar: "Sin iniciar",
  en_progreso: "En progreso",
  cumplida: "Cumplida",
  vencida: "Vencida",
};
