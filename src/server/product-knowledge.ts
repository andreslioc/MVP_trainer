import { type SQLWrapper, sql } from "drizzle-orm";

import type { db } from "../db/client.ts";
import { products, trainingAnswers, trainingQuestions, trainingSessions } from "../db/schema.ts";

export type ProductKnowledgeItem = {
  productId: string;
  name: string;
  score: number;
  previousScore: number | null;
  delta: number | null;
  answers: number;
  status: "linea_base" | "mejoro" | "estable" | "bajo";
};

export type ProductKnowledgeProgress = {
  score: number | null;
  delta: number | null;
  answers: number;
  products: number;
  comparableProducts: number;
  items: ProductKnowledgeItem[];
};

type ScoreRow = { product_id: string; name: string; answers: number; average: string | number };
export type ProductKnowledgeScore = {
  productId: string;
  name: string;
  answers: number;
  score: number;
};

function toPercent(average: number) {
  return Math.round(((average - 1) / 4) * 100);
}

async function readProductScores(
  database: typeof db,
  advisorId: string,
  start: Date,
  end: Date | null,
) {
  const rows = await database.execute<ScoreRow>(sql`
    SELECT p.id AS product_id,
           p.name,
           count(*)::int AS answers,
           avg((ta.scores->'conocimiento_producto'->>'score')::numeric) AS average
    FROM ${trainingAnswers as unknown as SQLWrapper} ta
    JOIN ${trainingSessions as unknown as SQLWrapper} ts ON ts.id = ta.session_id
    JOIN ${trainingQuestions as unknown as SQLWrapper} tq ON tq.id = ta.question_id
    JOIN ${products as unknown as SQLWrapper} p ON p.id = tq.product_id
    WHERE ts.advisor_id = ${advisorId}
      AND ta.scores ? 'conocimiento_producto'
      AND ta.created_at >= ${start.toISOString()}::timestamptz
      ${end ? sql`AND ta.created_at < ${end.toISOString()}::timestamptz` : sql``}
    GROUP BY p.id, p.name
    ORDER BY p.name ASC
  `);

  return [...rows].map((row) => ({
    productId: String(row.product_id),
    name: String(row.name),
    answers: Number(row.answers),
    score: toPercent(Number(row.average)),
  }));
}

/**
 * Conocimiento general, dando el mismo peso a cada producto.
 *
 * La mejora usa solo productos presentes en ambas ventanas. Mezclar un
 * producto nuevo —sin linea base— haria que el cambio dependiera de qué ficha
 * escogio, no de si aprendio.
 */
export async function readProductKnowledge(
  database: typeof db,
  advisorId: string,
  currentStart: Date,
  previousStart: Date,
): Promise<ProductKnowledgeProgress> {
  const [current, previous] = await Promise.all([
    readProductScores(database, advisorId, currentStart, null),
    readProductScores(database, advisorId, previousStart, currentStart),
  ]);
  return buildProductKnowledge(current, previous);
}

export function buildProductKnowledge(
  current: ProductKnowledgeScore[],
  previous: ProductKnowledgeScore[],
): ProductKnowledgeProgress {
  const previousByProduct = new Map(previous.map((item) => [item.productId, item]));
  const items: ProductKnowledgeItem[] = current.map((item) => {
    const previousItem = previousByProduct.get(item.productId);
    const delta = previousItem ? item.score - previousItem.score : null;
    return {
      ...item,
      previousScore: previousItem?.score ?? null,
      delta,
      status:
        delta === null ? "linea_base" : delta > 2 ? "mejoro" : delta < -2 ? "bajo" : "estable",
    };
  });
  const comparable = items.filter(
    (item): item is ProductKnowledgeItem & { delta: number } => item.delta !== null,
  );

  return {
    score:
      items.length === 0
        ? null
        : Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length),
    delta:
      comparable.length === 0
        ? null
        : Math.round(comparable.reduce((sum, item) => sum + item.delta, 0) / comparable.length),
    answers: items.reduce((sum, item) => sum + item.answers, 0),
    products: items.length,
    comparableProducts: comparable.length,
    items,
  };
}
