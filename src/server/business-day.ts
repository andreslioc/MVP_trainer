import type { SQLWrapper } from "drizzle-orm";
import { sql } from "drizzle-orm";

import { BUSINESS_TIMEZONE } from "../lib/analytics-period.ts";

/**
 * El dia calendario EN BOGOTA de una columna de fecha.
 *
 * Sin el `AT TIME ZONE`, Postgres agrupa por dia UTC y una practica de las
 * siete de la noche en Colombia cae en el dia siguiente: el panel mostraria
 * actividad en un dia en el que nadie trabajo.
 *
 * Vive aparte porque lo necesita mas de un panel —las analiticas por asesora y
 * el costo diario de IA— y una segunda copia de esta expresion es una copia que
 * algun dia agrupa por una zona distinta.
 */
export function businessDayColumn(columna: SQLWrapper) {
  return sql<string>`to_char(date_trunc('day', ${columna} AT TIME ZONE ${sql.raw(`'${BUSINESS_TIMEZONE}'`)}), 'YYYY-MM-DD')`;
}
