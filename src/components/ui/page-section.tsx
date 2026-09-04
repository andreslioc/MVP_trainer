import type { ReactNode } from "react";

/**
 * El contenedor de una pantalla: cuanto ancho ocupa y donde empieza el
 * contenido.
 *
 * Es la otra mitad de "donde se acomodan las tarjetas". Cada modulo habia
 * elegido su propio ancho maximo —5xl en Inicio, 6xl en Intelligence, 2xl en
 * Copilot, 3xl y 4xl en Analiticas— asi que al navegar de un modulo a otro la
 * columna de contenido se corria de lado y las tarjetas cambiaban de tamaño sin
 * que hubiera cambiado nada. Tres anchos con nombre en vez de nueve sueltos.
 *
 * El encabezado es opcional pero cuando se usa garantiza lo que piden las
 * reglas de accesibilidad: un solo `h1` por pagina, con el `id` al que apunta
 * `aria-labelledby`. Escrito a mano en cada pantalla, ese par se desincroniza.
 */

/**
 * El ancho, por lo que hace la pantalla y no por su medida.
 *
 * - `lectura`: una columna de texto o de filas. Una linea larga se pierde al
 *   volver al margen izquierdo, asi que se corta antes.
 * - `panel`: el ancho de trabajo por defecto. Dos o tres columnas de tarjeta.
 * - `completo`: sin tope propio; manda el del armazon. Para las dos pantallas
 *   que de verdad usan el ancho —el Copilot en vivo y Intelligence—.
 */
export type PageWidth = "lectura" | "panel" | "completo";

const widths: Record<PageWidth, string> = {
  lectura: "max-w-3xl",
  panel: "max-w-5xl",
  completo: "",
};

export function PageSection({
  before,
  children,
  eyebrow,
  lead,
  title,
  width = "panel",
}: {
  /** Lo que va ARRIBA del titulo: casi siempre un enlace para volver. */
  before?: ReactNode;
  children: ReactNode;
  /** El modulo o el momento del dia: "Durante el live", "Inicio". */
  eyebrow?: ReactNode;
  /** El parrafo que explica la pantalla en una frase. */
  lead?: ReactNode;
  title?: ReactNode;
  width?: PageWidth;
}) {
  return (
    <section aria-labelledby={title ? "page-title" : undefined} className={widths[width]}>
      {before}
      {eyebrow ? <p className="text-sm font-semibold text-primary">{eyebrow}</p> : null}
      {title ? (
        <h1
          className="mt-2 font-display text-3xl font-medium tracking-tight text-fg"
          id="page-title"
        >
          {title}
        </h1>
      ) : null}
      {lead ? <p className="mt-2 max-w-2xl text-fg-muted">{lead}</p> : null}
      {children}
    </section>
  );
}
