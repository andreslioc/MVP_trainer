import { notFound } from "next/navigation";

import { getSession } from "../../../../../lib/auth.ts";
import { getTrainingSession } from "../../../../../server/training/questions.ts";

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

  const firstQuestion = result.data.questions[0];
  return (
    <section aria-labelledby="page-title" className="max-w-4xl">
      <p className="text-sm font-semibold text-primary">Práctica en curso</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg" id="page-title">
        {result.data.productName}
      </h1>
      <p className="mt-2 text-fg-muted">
        {result.data.questions.length} preguntas disponibles en esta práctica privada.
      </p>

      {firstQuestion ? (
        <article className="mt-8 rounded-card border border-border bg-surface p-6">
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
            <span>{firstQuestion.difficulty}</span>
            <span aria-hidden="true">·</span>
            <span>{firstQuestion.intent}</span>
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-fg">{firstQuestion.text}</h2>
          <p className="mt-5 rounded-card border border-border bg-background p-4 text-sm text-fg-muted">
            El formulario de respuesta y la evaluación de nueve dimensiones llegan en el siguiente
            paso.
          </p>
        </article>
      ) : null}
    </section>
  );
}
