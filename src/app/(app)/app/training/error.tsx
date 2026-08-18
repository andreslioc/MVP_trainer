"use client";

export default function TrainingError({ reset }: { reset: () => void }) {
  return (
    <section className="rounded-card border border-destructive bg-confidence-low-bg p-4">
      <h1 className="text-xl font-semibold text-confidence-low-fg">
        No se pudo cargar el Training Simulator.
      </h1>
      <button
        className="mt-3 min-h-11 rounded-card border border-border-control bg-surface px-4 font-semibold text-primary-deep"
        onClick={reset}
        type="button"
      >
        Reintentar
      </button>
    </section>
  );
}
