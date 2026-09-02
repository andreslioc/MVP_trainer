import type { ReactNode } from "react";

/**
 * Una cifra con su nombre y, si aporta, su grafica pequeña.
 *
 * Figuras proporcionales, no tabulares: `tabular-nums` le da a cada digito el
 * ancho de un cero y a este tamaño un 121 se ve suelto. Las tabulares se
 * reservan para columnas que tienen que alinearse.
 */
export function MetricCard({
  label,
  value,
  unit,
  note,
  children,
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-card border border-border bg-surface p-4">
      <p className="text-sm text-fg-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-fg">
        {value}
        {unit ? <span className="ml-1 text-base font-normal text-fg-muted">{unit}</span> : null}
      </p>
      {note ? <p className="mt-1 text-xs text-fg-muted">{note}</p> : null}
      {children ? <div className="mt-auto">{children}</div> : null}
    </div>
  );
}
