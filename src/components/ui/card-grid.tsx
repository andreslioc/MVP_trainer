import type { ReactNode } from "react";

/**
 * Donde se acomodan las tarjetas. La rejilla del sistema, en un solo lugar.
 *
 * Es la mitad que mas se desviaba: cada pantalla escribia su propia escalera
 * —`sm:grid-cols-2 lg:grid-cols-3` aqui, `sm:grid-cols-2 lg:grid-cols-4` alla,
 * `md:grid-cols-2` en otra— y el resultado es que al pasar de un modulo a otro
 * las tarjetas se reacomodan en anchos distintos. Con una sola escalera, el
 * punto donde una fila se parte es el mismo en toda la app y la vista deja de
 * saltar.
 *
 * La escalera empieza SIEMPRE en una columna. A 320 px de ancho —el minimo que
 * exige el sistema— dos columnas dejan tarjetas de 140 px, y ahi no cabe ni un
 * numero con su etiqueta.
 */

/**
 * Cuantas columnas como maximo, en la pantalla mas ancha.
 *
 * Tres es el techo para tarjetas con texto y cuatro para las que solo llevan un
 * numero: a cuatro columnas un parrafo queda en una tira de dos palabras por
 * linea.
 */
export type CardGridColumns = 2 | 3 | 4;

/**
 * Nombres estaticos y no interpolados: Tailwind lee las clases del codigo
 * fuente, y `lg:grid-cols-${n}` no existe para el compilador.
 *
 * Cuatro columnas pasa por dos y no por tres — 1, 2, 4 divide parejo y evita la
 * fila huerfana de una sola tarjeta que deja el 3 cuando hay cuatro.
 */
const ladders: Record<CardGridColumns, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

export function CardGrid({
  as = "div",
  children,
  className = "",
  columns = 2,
}: {
  /**
   * `ul` cuando la rejilla es una lista de cosas comparables —fichas,
   * grabaciones—, que es lo que espera un lector de pantalla al anunciar
   * "lista de 12 elementos". `div` cuando son paneles distintos entre si.
   */
  as?: "div" | "ul";
  children: ReactNode;
  className?: string;
  columns?: CardGridColumns;
}) {
  // gap-4 fijo: 16px de la escala de 4px del sistema. Un gap por pantalla es lo
  // que hacia que dos modulos con la misma rejilla se vieran distintos.
  const classes = `grid gap-4 ${ladders[columns]} ${className}`.trim();
  if (as === "ul") return <ul className={classes}>{children}</ul>;
  return <div className={classes}>{children}</div>;
}
