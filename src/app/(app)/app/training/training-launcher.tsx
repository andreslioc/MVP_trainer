"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { DEFAULT_PRACTICE_SIZE, PRACTICE_SIZES } from "../../../../lib/practice-sizes.ts";
import {
  generateCategoryQuestionsAction,
  generateProductQuestionsAction,
  startCategorySessionAction,
  startProductSessionAction,
} from "./actions.ts";

type TrainingCategory = { category: string; productCount: number; questionCount: number };
type TrainingProduct = { id: string; name: string; brand: string; questionCount: number };
type Feedback = { type: "success" | "error"; message: string };
type Scope = "categoria" | "ficha";

export function TrainingLauncher({
  categories,
  products,
}: {
  categories: TrainingCategory[];
  products: TrainingProduct[];
}) {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>("categoria");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [practiceSize, setPracticeSize] = useState<number>(DEFAULT_PRACTICE_SIZE);
  const [counts, setCounts] = useState(() => ({
    ...Object.fromEntries(categories.map((item) => [item.category, item.questionCount])),
    ...Object.fromEntries(products.map((item) => [item.id, item.questionCount])),
  }));
  const [pending, setPending] = useState<"generate" | "start" | null>(null);
  const [feedback, setFeedback] = useState<Feedback>();

  const category = useMemo(
    () => categories.find((item) => item.category === selectedCategory),
    [categories, selectedCategory],
  );
  const product = useMemo(
    () => products.find((item) => item.id === selectedProduct),
    [products, selectedProduct],
  );
  // La clave del contador es la categoria o el id de la ficha, segun el alcance:
  // asi el "quedan N preguntas" no se mezcla entre los dos modos.
  const key = scope === "categoria" ? category?.category : product?.id;
  const chosen = scope === "categoria" ? category : product;
  const questionCount = key ? (counts[key] ?? 0) : 0;

  function pick(next: Scope) {
    setScope(next);
    setFeedback(undefined);
  }

  async function generate() {
    if (!key) return;
    setPending("generate");
    setFeedback(undefined);
    const result =
      scope === "categoria"
        ? await generateCategoryQuestionsAction(key)
        : await generateProductQuestionsAction(key);
    if (result.ok) {
      // Por categoria la tanda reemplaza; por ficha se suma a lo que ya tenia.
      const replaced =
        "replaced" in result && typeof result.replaced === "number" ? result.replaced : 0;
      setCounts((current) => ({
        ...current,
        [key]: (current[key] ?? 0) - replaced + result.data.length,
      }));
      setFeedback({
        type: "success",
        message: replaced
          ? `Tanda nueva: ${result.data.length} preguntas de otras fichas. Las ${replaced} anteriores se reemplazaron.`
          : `Listas ${result.data.length} preguntas nuevas.`,
      });
    } else {
      setFeedback({ type: "error", message: result.error.message });
    }
    setPending(null);
  }

  async function start() {
    if (!key) return;
    setPending("start");
    setFeedback(undefined);
    const result =
      scope === "categoria"
        ? await startCategorySessionAction(key, practiceSize)
        : await startProductSessionAction(key, practiceSize);
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
        <h2 className="text-xl font-semibold text-fg">Elige qué practicar</h2>

        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-fg">Alcance de la práctica</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["categoria", "Por categoría", "Fichas barajadas al azar"],
                ["ficha", "Por ficha", "Una sola ficha, a fondo"],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                className={`min-h-11 cursor-pointer rounded-card border px-4 py-2 ${
                  scope === value
                    ? "border-primary bg-primary text-primary-fg"
                    : "border-border-control bg-surface text-fg"
                }`}
                key={value}
              >
                <input
                  checked={scope === value}
                  className="sr-only"
                  name="training-scope"
                  onChange={() => pick(value)}
                  type="radio"
                  value={value}
                />
                <span className="font-semibold">{label}</span>
                <span
                  className={`block text-xs ${
                    scope === value ? "text-primary-fg/80" : "text-fg-muted"
                  }`}
                >
                  {hint}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {scope === "categoria" ? (
          <>
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
                  {item.category} · {item.productCount}{" "}
                  {item.productCount === 1 ? "ficha" : "fichas"}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <label className="mt-4 block text-sm font-medium text-fg" htmlFor="training-product">
              Ficha verificada
            </label>
            <select
              className="mt-1 min-h-11 w-full rounded-card border bg-surface px-3"
              id="training-product"
              onChange={(event) => {
                setSelectedProduct(event.target.value);
                setFeedback(undefined);
              }}
              value={selectedProduct}
            >
              <option value="">Selecciona una ficha</option>
              {products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.brand}
                </option>
              ))}
            </select>
          </>
        )}

        {!chosen ? (
          <p className="mt-4 rounded-card border border-border bg-background p-3 text-sm text-fg-muted">
            {scope === "categoria"
              ? "Selecciona una categoría para ver sus preguntas disponibles."
              : "Selecciona una ficha para ver sus preguntas disponibles."}
          </p>
        ) : questionCount === 0 ? (
          <p className="mt-4 rounded-card border border-warning-border bg-confidence-mid-bg p-3 text-sm text-confidence-mid-fg">
            {scope === "categoria"
              ? "Esta categoría todavía no tiene preguntas. Genera una tanda antes de comenzar: cubre tres fichas de una vez."
              : "Esta ficha todavía no tiene preguntas. Genera una tanda de seis antes de comenzar."}
          </p>
        ) : (
          <p className="mt-4 text-sm text-fg-muted" role="status">
            <strong className="tabular-nums text-fg">{questionCount}</strong>{" "}
            {questionCount === 1 ? "pregunta disponible" : "preguntas disponibles"}
            {scope === "categoria" && category ? (
              <>
                {" entre "}
                <strong className="tabular-nums text-fg">{category.productCount}</strong>{" "}
                {category.productCount === 1 ? "ficha" : "fichas"}. No sabes de cuál te va a tocar.
              </>
            ) : (
              " de esta ficha."
            )}
          </p>
        )}

        <div className="mt-5">
          <label className="block text-sm font-medium text-fg" htmlFor="training-size">
            Preguntas de la práctica
          </label>
          <select
            className="mt-1 min-h-11 w-full rounded-card border bg-surface px-3 sm:w-48"
            id="training-size"
            onChange={(event) => setPracticeSize(Number(event.target.value))}
            value={practiceSize}
          >
            {PRACTICE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} preguntas
              </option>
            ))}
          </select>
          {chosen && questionCount > 0 && questionCount < practiceSize ? (
            <p className="mt-2 text-sm text-fg-muted" role="status">
              Hay {questionCount} disponibles: la práctica traerá esas. Genera otra tanda para
              llegar a {practiceSize}.
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="min-h-11 rounded-card border border-border-control bg-surface px-4 font-semibold text-primary-deep disabled:opacity-60"
            disabled={!chosen || pending !== null}
            onClick={generate}
            type="button"
          >
            {pending === "generate" ? "Generando preguntas…" : "Generar preguntas"}
          </button>
          <button
            className="min-h-11 rounded-card bg-primary px-4 font-semibold text-primary-fg hover:bg-primary-deep disabled:opacity-60"
            disabled={!chosen || questionCount === 0 || pending !== null}
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
          <li>1. Elige categoría —fichas barajadas— o una ficha sola.</li>
          <li>2. Por categoría, cada tanda sortea tres fichas y reemplaza la anterior.</li>
          <li>3. Por ficha, cada tanda son seis preguntas que se suman.</li>
          <li>4. Elige cuántas quieres responder: de 3 para un repaso a 24 para una sesión.</li>
        </ol>
      </aside>
    </div>
  );
}
