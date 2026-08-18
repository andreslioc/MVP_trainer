export default function KnowledgeLoading() {
  return (
    <section aria-busy="true" aria-label="Cargando fichas">
      <div className="h-8 w-48 animate-pulse rounded-card bg-border" />
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <div
            className="h-64 animate-pulse rounded-card border border-border bg-surface"
            key={item}
          />
        ))}
      </div>
      <p className="sr-only">Cargando fichas…</p>
    </section>
  );
}
