/**
 * La ventana de tiempo del panel de analiticas.
 *
 * Vive aparte del modulo de servidor por dos razones: lo necesita tambien la
 * pagina para pintar el selector, y el calculo de fechas es justo lo que hay
 * que poder comprobar sin base de datos.
 *
 * ZONA HORARIA. El equipo esta en Colombia y el servidor corre en UTC. Sin
 * fijarla, "hoy" empieza a las 7 de la tarde de ayer para quien mira el panel:
 * a las 19:00 de Bogota ya son las 00:00 del dia siguiente en UTC, asi que una
 * practica de la tarde caeria en el dia equivocado y "Hoy" mostraria cero
 * teniendo actividad. Colombia no usa horario de verano desde 1993, asi que el
 * desfase es -05:00 siempre y no hace falta una tabla de reglas.
 */
export const BUSINESS_TIMEZONE = "America/Bogota";
const BUSINESS_OFFSET = "-05:00";

export const ANALYTICS_PERIODS = ["dia", "semana", "mes", "todo"] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  dia: "Hoy",
  semana: "7 días",
  mes: "30 días",
  todo: "Todo",
};

/**
 * La ventana dicha dentro de una frase, no como etiqueta suelta.
 *
 * "8 min en hoy" es lo que sale de reutilizar la etiqueta del boton dentro de
 * un texto. Las etiquetas del selector son sustantivos cortos y estas son
 * complementos: son dos trabajos distintos y por eso son dos listas.
 */
export const PERIOD_SPAN: Record<AnalyticsPeriod, string> = {
  dia: "hoy",
  semana: "en los últimos 7 días",
  mes: "en los últimos 30 días",
  todo: "en total",
};

/** Cuantos dias abarca cada ventana. `todo` no tiene inicio. */
export const PERIOD_DAYS: Record<AnalyticsPeriod, number | null> = {
  dia: 1,
  semana: 7,
  mes: 30,
  todo: null,
};

/**
 * Cuantas columnas dibuja la grafica de actividad diaria.
 *
 * `todo` no puede pintar una columna por dia desde el principio de los tiempos:
 * se queda en los ultimos 30, que es lo que cabe legible, y la etiqueta de la
 * tarjeta dice que son los ultimos 30 dias y no todo el historial.
 */
export function periodColumnDays(period: AnalyticsPeriod): number {
  return PERIOD_DAYS[period] ?? 30;
}

/** La fecha de hoy en la zona del negocio, como `YYYY-MM-DD`. */
export function businessToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** El dia `offset` dias antes de `desde`, tambien como `YYYY-MM-DD`. */
export function shiftBusinessDay(day: string, offset: number): string {
  // Se opera al mediodia UTC para que sumar o restar dias no cruce ninguna
  // frontera por redondeo de horas.
  const base = new Date(`${day}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + offset);
  return base.toISOString().slice(0, 10);
}

/**
 * El instante en que empieza la ventana, o `null` para `todo`.
 *
 * Es medianoche EN BOGOTA del primer dia incluido. Una ventana de siete dias
 * incluye hoy, asi que arranca seis dias atras: contar siete hacia atras daria
 * ocho dias en pantalla.
 */
export function periodStart(period: AnalyticsPeriod, now: Date = new Date()): Date | null {
  const days = PERIOD_DAYS[period];
  if (days === null) return null;
  const primerDia = shiftBusinessDay(businessToday(now), -(days - 1));
  return new Date(`${primerDia}T00:00:00${BUSINESS_OFFSET}`);
}

/** Los dias de la ventana, del mas antiguo al mas reciente. */
export function periodDayKeys(period: AnalyticsPeriod, now: Date = new Date()): string[] {
  const total = periodColumnDays(period);
  const hoy = businessToday(now);
  return Array.from({ length: total }, (_, index) => shiftBusinessDay(hoy, -(total - 1 - index)));
}

/** Lee el periodo del query string y cae en `mes` ante cualquier cosa rara. */
export function parsePeriod(value: unknown): AnalyticsPeriod {
  return ANALYTICS_PERIODS.includes(value as AnalyticsPeriod) ? (value as AnalyticsPeriod) : "mes";
}
