/**
 * Una seccion del formulario de ficha, plegable.
 *
 * `<details>` nativo y no estado de React: los campos siguen en el DOM cuando la
 * seccion esta cerrada, asi que el formulario se envia completo y react-hook-form
 * no se enter de nada. Con estado propio habria que sincronizar apertura y
 * validacion a mano, y un campo invalido escondido es un formulario que no se
 * puede arreglar.
 *
 * `open` se fuerza cuando la seccion tiene un error: cerrada, la asesora ve
 * "revisa el formulario" y no encuentra donde.
 */
export function FormSection({
  badge,
  children,
  hint,
  invalid,
  level = 2,
  open,
  title,
}: {
  badge?: string;
  children: React.ReactNode;
  hint?: string;
  invalid?: boolean;
  level?: 2 | 3;
  open?: boolean;
  title: string;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <details
      className={`rounded-card border bg-surface ${invalid ? "border-destructive" : "border-border"}`}
      open={open || invalid}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-4 marker:hidden">
        <Heading
          className={
            level === 2 ? "text-xl font-semibold text-fg" : "text-lg font-semibold text-fg"
          }
        >
          {title}
        </Heading>
        <span className="flex shrink-0 items-baseline gap-3 text-xs font-medium text-fg-muted">
          {badge ? <span>{badge}</span> : null}
          {invalid ? (
            <span className="text-sm font-semibold text-confidence-low-fg">Revisar</span>
          ) : null}
        </span>
      </summary>
      <div className="px-4 pb-4">
        {hint ? <p className="mb-4 text-sm text-fg-muted">{hint}</p> : null}
        {children}
      </div>
    </details>
  );
}
