"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { generateCategoryQuestionsAction, startCategorySessionAction } from "./actions.ts";

type TrainingCategory = {
  category: string;
  productCount: number;
  questionCount: number;
};

type Feedback = { type: "success" | "error"; message: string };

export function TrainingLauncher({ categories }: { categories: TrainingCategory[] }) {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState("");
  const [counts, setCounts] = useState(() =>
    Object.fromEntries(categories.map((item) => [item.category, item.questionCount])),
  );
  const [pending, setPending] = useState<"generate" | "start" | null>(null);
  const [feedback, setFeedback] = useState<Feedback>();
  const selected = useMemo(
    () => categories.find((item) => item.category === selectedCategory),
    [categories, selectedCategory],
  );
  const questionCount = selected ? (counts[selected.category] ?? 0) : 0;

  async function generate() {
    if (!selected) return;
    setPending("generate");
    setFeedback(undefined);
    const result = await generateCategoryQuestionsAction(selected.category);
    if (result.ok) {
      setCounts((current) => ({
        ...current,
        [selected.category]: (current[selected.category] ?? 0) + result.data.length,
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
    const result = await startCategorySessionAction(selected.category);
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
        <h2 className="text-xl font-semibold text-fg">Elige qué categoría practicar</h2>
        <label className="mt-4 block text-sm font-medium text-fg" htmlFor="training-category">
          Categoría verificada
        </label>
        <select
          className="mt-1 min-h-11 w-full rounded-card border bg-surface px-3"
          id="training-category"
          onChange={(event) => {
            setSelectedCategory(event.target.value);
            setFeedback(undefined);
          }}
          value={selectedCategory}
        >
          <option value="">Selecciona una categoría</option>
          {categories.map((item) => (
            <option key={item.category} value={item.category}>
              {item.category} · {item.productCount} {item.productCount === 1 ? "ficha" : "fichas"}
            </option>
          ))}
        </select>

        {!selected ? (
          <p className="mt-4 rounded-card border border-border bg-background p-3 text-sm text-fg-muted">
            Selecciona una categoría para ver sus preguntas disponibles.
          </p>
        ) : questionCount === 0 ? (
          <p className="mt-4 rounded-card border border-warning-border bg-confidence-mid-bg p-3 text-sm text-confidence-mid-fg">
            Esta categoría todavía no tiene preguntas. Genera una tanda antes de comenzar.
          </p>
        ) : (
          <p className="mt-4 text-sm text-fg-muted" role="status">
            <strong className="tabular-nums text-fg">{questionCount}</strong>{" "}
            {questionCount === 1 ? "pregunta disponible" : "preguntas disponibles"} entre{" "}
            <strong className="tabular-nums text-fg">{selected.productCount}</strong>{" "}
            {selected.productCount === 1 ? "ficha" : "fichas"}. No sabes de cuál te va a tocar.
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
          <li>1. Elige una categoría, no una ficha.</li>
          <li>2. Genera preguntas si necesitas una tanda nueva.</li>
          <li>3. Las preguntas llegan barajadas de varias fichas, como en un live.</li>
        </ol>
      </aside>
    </div>
  );
}
