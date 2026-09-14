import { cardClasses } from "./card.tsx";

/**
 * El aviso de que una ficha esta agotada.
 *
 * La ficha agotada NO se esconde: si una clienta pregunta por ella en vivo, la
 * asesora necesita los datos delante para responder "ahora no tenemos". Lo que
 * hace falta es que se note antes de abrir la boca, porque el resto de la
 * tarjeta se ve igual que la de un producto disponible.
 *
 * Texto ademas de color: el sistema no comunica estado solo con color, y
 * "agotado" es justo el dato que no se puede perder de un vistazo.
 */

/** `null` en `stockUnits` es "sin dato", no cero: ahi no se afirma nada. */
export function estaAgotado(stockUnits: number | null | undefined) {
  return stockUnits === 0;
}

export function StockBadge({
  className = "",
  stockUnits,
}: {
  className?: string;
  stockUnits: number | null | undefined;
}) {
  if (!estaAgotado(stockUnits)) return null;
  return (
    <span
      className={`inline-flex items-center rounded-card border border-warning-border bg-confidence-mid-bg px-2 py-0.5 text-xs font-semibold text-confidence-mid-fg ${className}`.trim()}
    >
      Sin stock
    </span>
  );
}

/**
 * El aviso grande, para la pantalla de la ficha.
 *
 * Dice tambien lo que SI se puede hacer: sin eso, "sin stock" se lee como "no
 * hables de esto", y lo correcto es lo contrario — se puede estudiar y se puede
 * responder por ella.
 */
export function StockNotice({ stockUnits }: { stockUnits: number | null | undefined }) {
  if (!estaAgotado(stockUnits)) return null;
  return (
    <p className={cardClasses({ density: "compacta", tone: "atencion", className: "mt-4" })}>
      <strong>Sin stock.</strong> No entra en las prácticas del Training, pero puedes estudiarla y
      responder por ella si una clienta pregunta: dile que ahora no hay.
    </p>
  );
}
