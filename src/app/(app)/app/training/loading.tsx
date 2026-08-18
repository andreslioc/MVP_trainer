export default function TrainingLoading() {
  return (
    <section aria-busy="true" aria-label="Cargando Training Simulator">
      <div className="h-8 w-64 animate-pulse rounded-card bg-border" />
      <div className="mt-8 h-72 animate-pulse rounded-card border border-border bg-surface" />
      <p className="sr-only">Cargando productos de práctica…</p>
    </section>
  );
}
