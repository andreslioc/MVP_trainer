import Link from "next/link";
import { notFound } from "next/navigation";

import { getSession } from "../../../../../lib/auth.ts";
import { getTrainingSession } from "../../../../../server/training/questions.ts";
import { TrainingResponseForm } from "./training-response-form.tsx";

export default async function TrainingSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { sessionId } = await params;
  const { q } = await searchParams;
  const authorization = await getSession();
  if (!authorization.ok) return null;
  const result = await getTrainingSession(sessionId, { authorize: async () => authorization });
  if (!result.ok) notFound();

  const questions = result.data.questions;
  // El indice viene de la URL para que la practica sobreviva a una recarga y se
  // pueda compartir el punto exacto. Se acota al rango: un `?q=99` escrito a
  // mano no debe romper la pantalla.
  const requested = Number.parseInt(q ?? "1", 10);
  const position = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), questions.length || 1)
    : 1;
  const question = questions[position - 1];
  const savedAnswer = question
    ? result.data.answers.find((answer) => answer.questionId === question.id)
    : undefined;
  const answeredIds = new Set(result.data.answers.map((answer) => answer.questionId));
  const answered = questions.filter((item) => answeredIds.has(item.id)).length;
  const href = (target: number) => `/app/training/${result.data.id}?q=${target}`;

  return (
    <section aria-labelledby="page-title" className="max-w-4xl">
      <p className="text-sm font-semibold text-primary">Práctica en curso</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg" id="page-title">
        {result.data.title}
      </h1>
      <p className="mt-2 text-fg-muted">
        {questions.length} preguntas en esta práctica privada · {answered} respondidas
        {result.data.category ? " · fichas barajadas al azar" : null}
      </p>

      {questions.length > 0 ? (
        <nav aria-label="Preguntas de la práctica" className="mt-6 flex flex-wrap gap-2">
          {questions.map((item, index) => {
            const current = index + 1 === position;
            return (
              <Link
                aria-current={current ? "step" : undefined}
                className={`flex h-9 w-9 items-center justify-center rounded-card border text-sm font-semibold ${
                  current
                    ? "border-primary bg-primary text-white"
                    : answeredIds.has(item.id)
                      ? "border-confidence-high-fg text-confidence-high-fg"
                      : "border-border text-fg-muted"
                }`}
                href={href(index + 1)}
                key={item.id}
              >
                {index + 1}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {question ? (
        <article className="mt-6 rounded-card border border-border bg-surface p-6">
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
            <span>
              Pregunta {position} de {questions.length}
            </span>
            <span aria-hidden="true">·</span>
            <span>{question.difficulty}</span>
            <span aria-hidden="true">·</span>
            <span>{question.intent}</span>
            {result.data.category ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-primary-deep">{question.productName}</span>
              </>
            ) : null}
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-fg">{question.text}</h2>
          <TrainingResponseForm
            key={question.id}
            nextHref={position < questions.length ? href(position + 1) : null}
            questionId={question.id}
            savedAnswer={savedAnswer}
            sessionId={result.data.id}
          />
        </article>
      ) : null}

      <div className="mt-6 flex justify-between">
        {position > 1 ? (
          <Link className="font-semibold text-primary underline" href={href(position - 1)}>
            ← Pregunta anterior
          </Link>
        ) : (
          <span />
        )}
        {position < questions.length ? (
          <Link className="font-semibold text-primary underline" href={href(position + 1)}>
            Siguiente pregunta →
          </Link>
        ) : (
          <span />
        )}
      </div>
    </section>
  );
}
