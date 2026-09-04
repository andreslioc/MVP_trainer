import type { ReactNode } from "react";

/**
 * La superficie de tarjeta del sistema, en un solo lugar.
 *
 * Antes cada pantalla la escribia a mano —`rounded-card border border-border
 * bg-surface p-5`— en 67 archivos, y se desvio: hay `p-4`, `p-5` y `p-6`
 * mezclados en el mismo modulo y dos nombres distintos de borde para el mismo
 * divisor. Una tarjeta que cambia de aire entre dos pantallas del mismo flujo
 * se lee como dos productos pegados.
 *
 * Se exporta la FUNCION de clases ademas del componente porque en el repo una
 * tarjeta es a veces un `<Link>`, a veces un `<li>`, a veces un `<details>` y a
 * veces un `<dialog>`. Un componente polimorfico con genericos costaria mas
 * tipos que valor; `cardClasses()` deja que cualquier elemento se vista de
 * tarjeta sin dejar de ser el elemento correcto para su semantica.
 */

/**
 * El papel que cumple la tarjeta, no su color.
 *
 * `tono` y no `color` a proposito: quien escribe una pantalla decide que ES la
 * tarjeta —una superficie normal, un aviso, un error— y el sistema decide con
 * que color se dice. Asi el tema oscuro cambia los colores sin tocar una sola
 * pantalla.
 */
export type CardTone = "superficie" | "tinte" | "alerta" | "atencion" | "logro";

/** Cuanto aire lleva adentro. La escala de 4px del sistema, no valores libres. */
export type CardDensity = "comoda" | "compacta" | "sin";

const tones: Record<CardTone, string> = {
  superficie: "border-border bg-surface text-fg",
  // El tinte del azul de marca: da separacion sin sombra, porque la elevacion
  // del sistema es plana y solo usa bordes.
  tinte: "border-primary-tint-border bg-primary-tint text-fg",
  alerta: "border-destructive bg-confidence-low-bg text-confidence-low-fg",
  atencion: "border-warning-border bg-confidence-mid-bg text-confidence-mid-fg",
  logro: "border-confidence-high-border bg-confidence-high-bg text-confidence-high-fg",
};

const densities: Record<CardDensity, string> = {
  comoda: "p-5",
  compacta: "p-4",
  // Para la tarjeta que envuelve una tabla o una lista que pone su propio aire:
  // el padding del contenedor le sumaria un margen que nadie pidio.
  sin: "",
};

export function cardClasses({
  tone = "superficie",
  density = "comoda",
  interactive = false,
  className = "",
}: {
  tone?: CardTone;
  density?: CardDensity;
  /** Para la tarjeta que ES un enlace o un boton: marca el borde al pasar. */
  interactive?: boolean;
  className?: string;
} = {}) {
  return [
    "rounded-card border",
    tones[tone],
    densities[density],
    interactive
      ? "transition-colors duration-120 ease-out hover:border-primary motion-reduce:transition-none"
      : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Card({
  children,
  className,
  density,
  interactive,
  tone,
}: {
  children: ReactNode;
  className?: string;
  density?: CardDensity;
  interactive?: boolean;
  tone?: CardTone;
}) {
  return <div className={cardClasses({ tone, density, interactive, className })}>{children}</div>;
}
