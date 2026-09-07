import { count, gte, sql, sum } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/client.ts";
import { llmCalls } from "../db/schema.ts";
import {
  ANALYTICS_PERIODS,
  type AnalyticsPeriod,
  periodDayKeys,
  periodStart,
} from "../lib/analytics-period.ts";
import { type AdvisorRole, requireRole } from "../lib/auth.ts";
import { businessDayColumn } from "./business-day.ts";

/**
 * El gasto de IA por dia, para saber cuanto cuesta usar esto.
 *
 * El panel mostraba un unico acumulado —"US$ 10,91"— que no contesta la pregunta
 * que uno tiene: si el gasto va subiendo, cuanto es un dia normal, y si el pico
 * de ayer fue uso real o algo corriendo en vacio. Un total no distingue diez
 * dolares en un dia de diez dolares en un mes.
 *
 * Va por dia calendario de BOGOTA y no de UTC: en Colombia un live de la noche
 * cae en el dia siguiente en UTC, y el dia del gasto quedaria corrido respecto
 * al dia del trabajo que lo causo.
 */
const inputSchema = z.object({ period: z.enum(ANALYTICS_PERIODS).default("semana") }).strict();

export type AiCostDay = { day: string; costUsd: number; calls: number };

export type AiCostReport = {
  period: AnalyticsPeriod;
  /** Los dias de la ventana, del mas antiguo al ultimo. Sin huecos. */
  days: AiCostDay[];
  costUsd: number;
  calls: number;
  /**
   * Promedio POR DIA DE LA VENTANA, no por dia con actividad.
   *
   * Dividir entre los dias que tuvieron gasto infla el promedio y sirve para lo
   * contrario de lo que se pregunta: quien mira esto quiere saber cuanto cuesta
   * una semana, y una semana tiene siete dias aunque dos esten en cero.
   */
  avgPerDayUsd: number;
  /** Nulo sin llamadas: un costo por llamada de 0 con cero llamadas es falso. */
  costPerCallUsd: number | null;
  /** El dia mas caro de la ventana, para que un pico no pase inadvertido. */
  peak: AiCostDay | null;
};

type CostDatabase = Pick<typeof db, "select">;
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };

export type AiCostDependencies = {
  database?: CostDatabase;
  authorize?: (role: AdvisorRole) => Promise<AuthorizationResult>;
  now?: () => Date;
};

/** `numeric` de Postgres llega como string: el costo se suma en la base. */
function toNumber(value: string | number | null) {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : (value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function readAiCostByDay(
  input: z.input<typeof inputSchema> = {},
  options: AiCostDependencies = {},
) {
  const database = options.database ?? db;
  const authorize = options.authorize ?? requireRole;
  const now = options.now ?? (() => new Date());

  // Solo admin: el costo es informacion de la organizacion, no de una asesora.
  const authorization = await authorize("admin");
  if (!authorization.ok) return authorization;

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { code: "INVALID_PERIOD" as const, message: z.prettifyError(parsed.error) },
    };
  }
  const period = parsed.data.period;

  const windowDays = periodDayKeys(period, now());
  const desde = periodStart(period, now());

  const rows = await database
    .select({
      day: businessDayColumn(llmCalls.createdAt),
      costUsd: sum(llmCalls.costUsd),
      calls: count(),
    })
    .from(llmCalls)
    // `todo` no tiene inicio, pero la grafica pinta 30 columnas: se acota a la
    // ventana dibujada para que el promedio y las columnas cuenten lo mismo.
    .where(gte(llmCalls.createdAt, desde ?? new Date(`${windowDays[0]}T00:00:00-05:00`)))
    .groupBy(businessDayColumn(llmCalls.createdAt))
    .orderBy(sql`1`);

  const porDia = new Map(rows.map((row) => [row.day, row]));
  // Los dias sin gasto se rellenan en cero y no se omiten: una grafica con
  // huecos hace creer que la ventana es mas corta, y el promedio de la semana
  // depende de que esten los siete dias.
  const days: AiCostDay[] = windowDays.map((day) => ({
    day,
    costUsd: toNumber(porDia.get(day)?.costUsd ?? 0),
    calls: porDia.get(day)?.calls ?? 0,
  }));

  const costUsd = days.reduce((total, item) => total + item.costUsd, 0);
  const calls = days.reduce((total, item) => total + item.calls, 0);
  const peak = days.reduce<AiCostDay | null>(
    (mayor, item) => (item.costUsd > 0 && (!mayor || item.costUsd > mayor.costUsd) ? item : mayor),
    null,
  );

  return {
    ok: true as const,
    data: {
      period,
      days,
      costUsd,
      calls,
      avgPerDayUsd: days.length === 0 ? 0 : costUsd / days.length,
      costPerCallUsd: calls === 0 ? null : costUsd / calls,
      peak,
    } satisfies AiCostReport,
  };
}
