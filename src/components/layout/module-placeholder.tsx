export function ModulePlaceholder({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <section aria-labelledby="page-title" className="max-w-3xl">
      <p className="text-sm font-semibold text-primary">{eyebrow}</p>
      <h1 id="page-title" className="mt-2 text-3xl font-semibold tracking-tight text-fg">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-fg-muted">{description}</p>
      <div className="mt-8 rounded-card border border-border bg-surface p-4">
        <p className="font-medium text-fg">Módulo preparado</p>
        <p className="mt-1 text-sm text-fg-muted">
          Su flujo funcional se construirá en el siguiente paso correspondiente del blueprint.
        </p>
      </div>
    </section>
  );
}
