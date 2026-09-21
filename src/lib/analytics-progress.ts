import { PERIOD_DAYS, type AnalyticsPeriod, periodStart } from "./analytics-period.ts";

type Score = {
  dimension: string;
  average: number;
  answers: number;
};

type ScoreSet = {
  dimensions: Score[];
  scoredAnswers: number;
  accuracyPercent: number | null;
};

export type DimensionTrend = Score & {
  previousAverage: number | null;
  delta: number | null;
};

export type ProgressComparison = {
  label: string;
  currentAccuracy: number | null;
  previousAccuracy: number | null;
  accuracyDelta: number | null;
  currentAnswers: number;
  previousAnswers: number;
  improved: DimensionTrend | null;
  focus: DimensionTrend | null;
  /** Todas las dimensiones comparables, para explicar como cambio la respuesta. */
  trends: DimensionTrend[];
};

/** Dos ventanas contiguas; `Todo` compara los 30 días recientes con los 30 anteriores. */
export function comparisonWindow(period: AnalyticsPeriod, now: Date = new Date()) {
  const effectivePeriod: AnalyticsPeriod = period === "todo" ? "mes" : period;
  const days = PERIOD_DAYS[effectivePeriod] ?? 30;
  const currentStart = periodStart(effectivePeriod, now) as Date;
  const previousStart = new Date(currentStart.getTime() - days * 24 * 60 * 60 * 1_000);
  const label: Record<AnalyticsPeriod, string> = {
    dia: "frente a ayer",
    semana: "frente a los 7 días anteriores",
    mes: "frente a los 30 días anteriores",
    todo: "últimos 30 días frente a los 30 anteriores",
  };
  return { currentStart, previousStart, label: label[period] };
}

function oneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

/** Resume cambios reales; no declara avance cuando falta una base comparable. */
export function buildProgressComparison(
  current: ScoreSet,
  previous: ScoreSet,
  label: string,
): ProgressComparison {
  const previousByDimension = new Map(
    previous.dimensions.map((dimension) => [dimension.dimension, dimension]),
  );
  const trends: DimensionTrend[] = current.dimensions.map((dimension) => {
    const previousDimension = previousByDimension.get(dimension.dimension);
    return {
      ...dimension,
      previousAverage: previousDimension?.average ?? null,
      delta: previousDimension ? oneDecimal(dimension.average - previousDimension.average) : null,
    };
  });
  const improved =
    [...trends]
      .filter((item) => item.delta !== null && item.delta > 0)
      .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))[0] ?? null;
  const focus = [...trends].sort((a, b) => a.average - b.average)[0] ?? null;
  const accuracyDelta =
    current.accuracyPercent === null || previous.accuracyPercent === null
      ? null
      : current.accuracyPercent - previous.accuracyPercent;

  return {
    label,
    currentAccuracy: current.accuracyPercent,
    previousAccuracy: previous.accuracyPercent,
    accuracyDelta,
    currentAnswers: current.scoredAnswers,
    previousAnswers: previous.scoredAnswers,
    improved,
    focus,
    trends,
  };
}
