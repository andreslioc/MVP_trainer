/**
 * Una seccion de ficha que se abre y se cierra.
 *
 * `<details>` nativo y no estado de React: la asesora abre dos o tres secciones
 * de una ficha y cierra el resto, y eso el navegador ya lo hace. Asi la pagina
 * de estudio sigue siendo un Server Component completo.
 */
export function CollapsibleSection({
  children,
  count,
  open,
  title,
}: {
  children: React.ReactNode;
  count?: number;
  open?: boolean;
  title: string;
}) {
  return (
    <details className="border-t border-border py-2" open={open}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-semibold text-fg marker:hidden">
        <span>{title}</span>
        <span className="text-sm font-medium tabular-nums text-fg-muted">
          {count === undefined ? "" : count}
        </span>
      </summary>
      <div className="pt-2 text-sm text-fg">{children}</div>
    </details>
  );
}
