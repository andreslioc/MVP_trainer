"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { generateTrainingQuestionsAction, startTrainingSessionAction } from "./actions.ts";

type TrainingProduct = {
  id: string;
  name: string;
  brand: string;
  questionCount: number;
};

type Feedback = { type: "success" | "error"; message: string };

export function TrainingLauncher({ products }: { products: TrainingProduct[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState("");
  const [counts, setCounts] = useState(() =>
    Object.fromEntries(products.map((product) => [product.id, product.questionCount])),
  );
  const [pending, setPending] = useState<"generate" | "start" | null>(null);
  const [feedback, setFeedback] = useState<Feedback>();
  const selected = useMemo(
    () => products.find((product) => product.id === selectedId),
    [products, selectedId],
  );
  const questionCount = selected ? (counts[selected.id] ?? 0) : 0;

  async function generate() {
    if (!selected) return;
    setPending("generate");
    setFeedback(undefined);
    const result = await generateTrainingQuestionsAction(selected.id);
    if (result.ok) {
      setCounts((current) => ({
        ...current,
        [selected.id]: (current[selected.id] ?? 0) + result.data.length,
      }));
      setFeedback({ type: "success", message: "La nueva tanda quedó lista para practicar." });
    } else {
      setFeedback({ type: "error", message: result.error.message });
    }
    setPending(null);
  }

  async function start() {
    if (!selected) return;
    setPending("start");
    setFeedback(undefined);
    const result = await startTrainingSessionAction(selected.id);
    if (result.ok) {
      router.push(`/app/training/${result.data.id}`);
      return;
    }
    setFeedback({ type: "error", message: result.error.message });
    setPending(null);
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="rounded-card border border-border bg-surface p-5">
        <h2 className="text-xl font-semibold text-fg">Elige qué producto practicar</h2>
        <label className="mt-4 block text-sm font-medium text-fg" htmlFor="training-product">
          Producto verificado
        </label>
        <select
          className="mt-1 min-h-11 w-full rounded-card border bg-surface px-3"
          id="training-product"
          onChange={(event) => {
            setSelectedId(event.target.value);
            setFeedback(undefined);
          }}
          value={selectedId}
        >
          <option value="">Selecciona una ficha</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} · {product.brand}
            </option>
          ))}
        </select>

        {!selected ? (
          <p className="mt-4 rounded-card border border-border bg-background p-3 text-sm text-fg-muted">
            Selecciona un producto para ver sus preguntas disponibles.
          </p>
        ) : questionCount === 0 ? (
          <p className="mt-4 rounded-card border border-warning-border bg-confidence-mid-bg p-3 text-sm text-confidence-mid-fg">
            Este producto todavía no tiene preguntas. Genera una tanda antes de comenzar.
          </p>
        ) : (
          <p className="mt-4 text-sm text-fg-muted" role="status">
            <strong className="tabular-nums text-fg">{questionCount}</strong>{" "}
            {questionCount === 1 ? "pregunta disponible" : "preguntas disponibles"}.
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="min-h-11 rounded-card border border-border-control bg-surface px-4 font-semibold text-primary-deep disabled:opacity-60"
            disabled={!selected || pending !== null}
            onClick={generate}
            type="button"
          >
            {pending === "generate" ? "Generando preguntas…" : "Generar preguntas"}
          </button>
          <button
            className="min-h-11 rounded-card bg-primary px-4 font-semibold text-primary-fg hover:bg-primary-deep disabled:opacity-60"
            disabled={!selected || questionCount === 0 || pending !== null}
            onClick={start}
            type="button"
          >
            {pending === "start" ? "Abriendo práctica…" : "Comenzar práctica"}
          </button>
        </div>

        {feedback ? (
          <p
            className={`mt-4 rounded-card border p-3 text-sm ${
              feedback.type === "success"
                ? "border-success bg-confidence-high-bg text-confidence-high-fg"
                : "border-destructive bg-confidence-low-bg text-confidence-low-fg"
            }`}
            role={feedback.type === "error" ? "alert" : "status"}
          >
            {feedback.message}
          </p>
        ) : null}
      </div>

      <aside className="rounded-card border border-border bg-background p-5">
        <h2 className="font-semibold text-fg">Cómo funciona</h2>
        <ol className="mt-3 space-y-3 text-sm text-fg-muted">
          <li>1. Elige una ficha revisada por el equipo.</li>
          <li>2. Genera preguntas si necesitas una tanda nueva.</li>
          <li>3. Abre la práctica y responde como si estuvieras en vivo.</li>
        </ol>
      </aside>
    </div>
  );
}
