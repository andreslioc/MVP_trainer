"use client";

import Link from "next/link";
import { useState } from "react";

import { evaluationDimensionKeys } from "../../../../../lib/ai/schemas.ts";
import { evaluateTrainingAnswerAction } from "../actions.ts";

const dimensionLabels = {
  conocimiento_producto: "Conocimiento del producto",
  claridad_explicacion: "Claridad de la explicación",
  naturalidad_cercania: "Naturalidad y cercanía",
  uso_responsable_evidencia: "Uso responsable de evidencia",
  manejo_objeciones: "Manejo de objeciones",
  capacidad_persuasion: "Capacidad de persuasión",
  uso_cta: "Uso de CTA",
  duracion: "Duración",
  cumplimiento_reglas_marca: "Reglas de marca",
} as const;

type EvaluationView = {
  scores: Record<string, { score: number; reason: string }> | null;
  feedback: string | null;
  improvedAnswer: string | null;
};

type SavedAnswer = EvaluationView & { advisorAnswer: string };

export function TrainingResponseForm({
  sessionId,
  questionId,
  savedAnswer,
  nextHref,
}: {
  sessionId: string;
  questionId: string;
  savedAnswer?: SavedAnswer;
  /** `null` en la ultima pregunta de la tanda. */
  nextHref: string | null;
}) {
  const [advisorAnswer, setAdvisorAnswer] = useState(savedAnswer?.advisorAnswer ?? "");
  const [evaluation, setEvaluation] = useState<EvaluationView | undefined>(savedAnswer);
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setIsSubmitting(true);
    try {
      const result = await evaluateTrainingAnswerAction({ sessionId, questionId, advisorAnswer });
      if (result.ok) {
        setEvaluation(result.data);
      } else {
        setError(result.error.message);
        if ("recoverable" in result.error) {
          setEvaluation({ scores: null, feedback: null, improvedAnswer: null });
        }
      }
    } catch {
      setError("No se pudo enviar la respuesta. Intenta nuevamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const complete = Boolean(evaluation?.scores && evaluation.feedback && evaluation.improvedAnswer);

  return (
    <div className="mt-6 space-y-6">
      <form onSubmit={submit}>
        <label className="block text-sm font-semibold text-fg" htmlFor="advisor-answer">
          Tu respuesta como si estuvieras en vivo
        </label>
        <textarea
          className="mt-2 min-h-40 w-full rounded-card border border-border-control bg-surface p-3 text-fg"
          disabled={isSubmitting}
          id="advisor-answer"
          maxLength={5_000}
          onChange={(event) => setAdvisorAnswer(event.target.value)}
          required
          value={advisorAnswer}
        />
        <button
          className="mt-3 min-h-11 rounded-card bg-primary px-5 font-semibold text-primary-fg hover:bg-primary-deep disabled:opacity-60"
          disabled={isSubmitting || !advisorAnswer.trim()}
          type="submit"
        >
          {isSubmitting ? "Evaluando…" : complete ? "Evaluar de nuevo" : "Evaluar respuesta"}
        </button>
      </form>

      {error ? (
        <p
          className="rounded-card border border-destructive bg-confidence-low-bg p-3 text-sm text-confidence-low-fg"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {evaluation && !complete && !error ? (
        <p className="rounded-card border border-warning-border bg-confidence-mid-bg p-3 text-sm text-confidence-mid-fg">
          Tu respuesta está guardada y la evaluación está pendiente. Puedes reintentar.
        </p>
      ) : null}

      {complete && evaluation?.scores ? (
        <section
          aria-labelledby="evaluation-title"
          className={`space-y-5 ${isSubmitting ? "opacity-50" : ""}`}
        >
          <div>
            <p className="text-sm font-semibold text-primary">
              {isSubmitting
                ? "Evaluación anterior — calculando la nueva…"
                : "Evaluación completada"}
            </p>
            <h3 className="mt-1 text-2xl font-semibold text-fg" id="evaluation-title">
              Tus nueve dimensiones
            </h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {evaluationDimensionKeys.map((key) => {
              const dimension = evaluation.scores?.[key];
              if (!dimension) return null;
              return (
                <article className="rounded-card border border-border bg-background p-4" key={key}>
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="font-semibold text-fg">{dimensionLabels[key]}</h4>
                    <span className="rounded-full bg-primary px-2 py-1 text-sm font-bold text-primary-fg">
                      {dimension.score}/5
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-fg-muted">{dimension.reason}</p>
                </article>
              );
            })}
          </div>
          <article className="rounded-card border border-border bg-background p-4">
            <h4 className="font-semibold text-fg">Feedback global</h4>
            <p className="mt-2 text-fg-muted">{evaluation.feedback}</p>
          </article>
          <article className="rounded-card border border-success bg-confidence-high-bg p-4">
            <h4 className="font-semibold text-confidence-high-fg">Versión mejorada</h4>
            <p className="mt-2 text-fg">{evaluation.improvedAnswer}</p>
          </article>
          {nextHref ? (
            <Link
              className="inline-flex min-h-11 items-center rounded-card bg-primary px-5 font-semibold text-primary-fg hover:bg-primary-deep"
              href={nextHref}
            >
              Siguiente pregunta →
            </Link>
          ) : (
            <p className="font-semibold text-fg">
              Era la última pregunta de la tanda. Vuelve a Training para practicar otro producto.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
