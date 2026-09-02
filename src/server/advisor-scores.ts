import { type SQLWrapper, sql } from "drizzle-orm";

import type { db } from "../db/client.ts";
import { trainingAnswers, trainingSessions } from "../db/schema.ts";

/** La rubrica va de 1 a 5. Vive aca porque de esto depende el porcentaje. */
const RUBRIC_MIN = 1;
const RUBRIC_MAX = 5;

/**
 * Cuantas respuestas hacen falta para dejar de calibrar.
 *
 * Con menos, el promedio se mueve entero con una sola respuesta buena o mala,
 * y presentarlo como un puntaje firme es engañar a quien decide con el. El
 * panel lo dice en pantalla en vez de esconderlo.
 */
export const CALIBRATION_ANSWERS = 12;

export type DimensionScore = {
  dimension: string;
  average: number;
  percent: number;
  answers: number;
};

function toPercent(average: number) {
  return Math.round(((average - RUBRIC_MIN) / (RUBRIC_MAX - RUBRIC_MIN)) * 100);
}

/**
 * Las nueve notas de la rubrica y el acierto que sale de ellas.
 *
 * Vive aparte de `advisor-analytics.ts` porque es una responsabilidad propia
 * —como se puntua— y porque el archivo de analiticas ya rozaba el limite de
 * 300 lineas juntando consultas de practica, de vivo y de puntuacion.
 */
export async function readDimensionScores(
  database: typeof db,
  advisorId: string,
  desde: Date | null,
) {
  // Las dimensiones salen del jsonb de notas: son las mismas nueve que escribe
  // la rubrica, y se leen de los datos en vez de repetirse aca, para que una
  // dimension nueva aparezca en el panel sin tocar este archivo.
  const filas = await database.execute(sql`
    SELECT d.key AS dimension,
           count(*)::int AS answers,
           avg((d.value->>'score')::numeric) AS average
    FROM ${trainingAnswers as unknown as SQLWrapper} ta
    JOIN ${trainingSessions as unknown as SQLWrapper} ts ON ts.id = ta.session_id
    CROSS JOIN LATERAL jsonb_each(ta.scores) d
    WHERE ts.advisor_id = ${advisorId} AND ta.scores IS NOT NULL
      ${
        // La fecha va como texto ISO y no como Date: por esta via cruda el
        // driver serializa el parametro el mismo, y con un objeto Date muere
        // con "the string argument must be of type string". El cast le devuelve
        // el tipo a Postgres.
        desde ? sql`AND ta.created_at >= ${desde.toISOString()}::timestamptz` : sql``
      }
    GROUP BY d.key
    ORDER BY avg((d.value->>\'score\')::numeric) ASC`);

  const dimensions: DimensionScore[] = [...filas].map((row) => {
    const average = Number(row.average ?? 0);
    return {
      dimension: String(row.dimension),
      average: Math.round(average * 10) / 10,
      percent: toPercent(average),
      answers: Number(row.answers ?? 0),
    };
  });

  // Cuantas RESPUESTAS estan calificadas, no cuantos pares dimension-respuesta.
  // La rubrica califica las nueve dimensiones de cada respuesta, asi que sumar
  // los conteos por dimension multiplicaba por nueve: con dos respuestas el
  // panel ya se declaraba calibrado y mostraba el puntaje como firme.
  const scoredAnswers = dimensions.reduce((mayor, item) => Math.max(mayor, item.answers), 0);
  const pesoTotal = dimensions.reduce((total, item) => total + item.answers, 0);
  const accuracyPercent =
    dimensions.length === 0 || pesoTotal === 0
      ? null
      : toPercent(
          dimensions.reduce((total, item) => total + item.average * item.answers, 0) / pesoTotal,
        );

  return { dimensions, scoredAnswers, accuracyPercent };
}
