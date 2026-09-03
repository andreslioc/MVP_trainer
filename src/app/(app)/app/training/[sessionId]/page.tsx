import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getSession } from "../../../../../lib/auth.ts";
import { isPending, latestAnswers } from "../../../../../lib/training/summary.ts";
import { getTrainingSession } from "../../../../../server/training/questions.ts";
import { FinishPracticeButton } from "./finish-practice-button.tsx";
import { PracticeTimer } from "./practice-timer.tsx";
import { TrainingResponseForm } from "./training-response-form.tsx";

/**
 * La practica es lineal: contestas la que salga y pasa a la siguiente.
 *
 * La pregunta ya NO viene de la URL. Elegirla era una decision de la asesora
 * que no le aporta nada —en un live tampoco escoge cual le preguntan— y le
 * permitia saltarse las difíciles. La posicion se deriva del servidor: la
 * primera pregunta pendiente de la tanda. Al terminarlas todas, la pantalla
 * manda al consolidado.
 */
export default async function TrainingSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const authorization = await getSession();
  if (!authorization.ok) return null;
  const result = await getTrainingSession(sessionId, { authorize: async () => authorization });
  if (!result.ok) notFound();

  const questions = result.data.questions;
  const summaryHref = `/app/training/${result.data.id}/resumen`;
  const latest = latestAnswers(result.data.answers);
  // Pendiente es la que nunca se respondio y tambien la que se respondio y su
  // evaluacion fallo: en ese caso la pantalla vuelve a caer en ella con la
  // respuesta cargada para reintentar, en vez de dejar un hueco en la tanda.
  const position = questions.findIndex((item) => isPending(latest.get(item.id))) + 1;
  const answered = questions.filter((item) => !isPending(latest.get(item.id))).length;

  // Ya no queda nada por responder —o la practica se cerro antes de tiempo—:
  // el lugar de esta sesion es el resumen, no una pregunta.
  if (questions.length > 0 && (position === 0 || result.data.finishedAt)) redirect(summaryHref);

  const question = questions[position - 1];

  return (
    <section aria-labelledby="page-title" className="max-w-4xl">
      <PracticeTimer sessionId={result.data.id} />
      <p className="text-sm font-semibold text-primary">Práctica en curso</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg" id="page-title">
        {result.data.title}
      </h1>
      <p className="mt-2 text-fg-muted">
        {questions.length} preguntas en esta práctica privada · {answered} respondidas
        {result.data.category ? " · fichas barajadas al azar" : null}
      </p>

      {questions.length === 0 ? (
        <div className="mt-8 rounded-card border border-warning-border bg-confidence-mid-bg p-6">
          <h2 className="text-xl font-semibold text-confidence-mid-fg">
            Esta práctica quedó sin preguntas
          </h2>
          <p className="mt-2 text-confidence-mid-fg">
            La tanda se reemplazó después de abrir la práctica. Genera preguntas otra vez y abre una
            nueva.
          </p>
          <Link
            className="mt-4 inline-block font-semibold text-primary underline"
            href="/app/training"
          >
            Volver a Training
          </Link>
        </div>
      ) : null}

      {question ? (
        <>
          {/* Barra de avance, no un selector: informa donde va sin dejarla
              escoger la pregunta. Las casillas son decorativas y el dato para
              lector de pantalla lo lleva el texto de abajo. */}
          <div aria-hidden="true" className="mt-6 flex flex-wrap gap-2">
            {questions.map((item, index) => (
              <span
                className={`h-2 w-8 rounded-full ${
                  index + 1 === position
                    ? "bg-primary"
                    : !isPending(latest.get(item.id))
                      ? "bg-confidence-high-fg"
                      : "bg-border"
                }`}
                key={item.id}
              />
            ))}
          </div>

          <article className="mt-4 rounded-card border border-border bg-surface p-6">
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
              isLast={position === questions.length}
              key={question.id}
              questionId={question.id}
              savedAnswer={latest.get(question.id)}
              sessionId={result.data.id}
              summaryHref={summaryHref}
            />
          </article>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-fg-muted">
              Te quedan {questions.length - answered} de {questions.length}. Contesta y pasa a la
              siguiente.
            </p>
            <FinishPracticeButton
              answered={answered}
              sessionId={result.data.id}
              summaryHref={summaryHref}
            />
          </div>
        </>
      ) : null}
    </section>
  );
}
