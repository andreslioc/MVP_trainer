import { evaluationDimensionKeys } from "../../../../../../lib/ai/schemas.ts";
import {
  type PracticeLevel,
  type PracticeSummary,
  trainingDimensionLabels,
} from "../../../../../../lib/training/summary.ts";

/**
 * El consolidado dibujado. Server Component: no tiene estado ni handlers, y el
 * detalle por pregunta se abre con `<details>` nativo en vez de un `useState`
 * que obligaria a mandar la tanda entera al navegador.
 */

const levelLabel: Record<PracticeLevel, string> = {
  excelente: "Excelente",
  bien: "Vas bien",
  aceptable: "Aceptable",
  reforzar: "Hay que reforzar",
};

/** El semaforo del sistema de diseno, el mismo de la confianza de evidencia. */
const levelStyle: Record<PracticeLevel, string> = {
  excelente: "border-success bg-confidence-high-bg text-confidence-high-fg",
  bien: "border-success bg-confidence-high-bg text-confidence-high-fg",
  aceptable: "border-warning-border bg-confidence-mid-bg text-confidence-mid-fg",
  reforzar: "border-destructive bg-confidence-low-bg text-confidence-low-fg",
};

function ScoreBar({ score }: { score: number }) {
  return (
    <div aria-hidden="true" className="mt-2 h-2 w-full rounded-full bg-border">
      <div
        className="h-2 rounded-full bg-primary"
        style={{ width: `${Math.round((score / 5) * 100)}%` }}
      />
    </div>
  );
}

export function PracticeScorecard({ summary }: { summary: PracticeSummary }) {
  if (summary.answered === 0) {
    return (
      <div className="mt-8 rounded-card border border-warning-border bg-confidence-mid-bg p-6">
        <h2 className="text-xl font-semibold text-confidence-mid-fg">
          Esta práctica no tiene respuestas evaluadas
        </h2>
        <p className="mt-2 text-confidence-mid-fg">
          Sin al menos una respuesta evaluada no hay nota que promediar ni dimensión que comparar.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-8 grid gap-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
        <div
          className={`rounded-card border p-5 ${
            summary.level ? levelStyle[summary.level] : "border-border bg-surface text-fg"
          }`}
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide">Nota de la práctica</h2>
          <p className="mt-2 text-4xl font-semibold tabular-nums">{summary.score}/5</p>
          <p className="mt-1 font-semibold">{summary.level ? levelLabel[summary.level] : null}</p>
        </div>
        <div className="rounded-card border border-border bg-surface p-5">
          <h2 className="font-semibold text-fg">Lo que ya te sale</h2>
          <ul className="mt-2 space-y-1 text-sm text-fg-muted">
            {summary.strengths.map((dimension) => (
              <li key={dimension.key}>
                <strong className="tabular-nums text-fg">{dimension.score}/5</strong>{" "}
                {dimension.label}
              </li>
            ))}
          </ul>
          <h2 className="mt-4 font-semibold text-fg">Lo que toca practicar</h2>
          <ul className="mt-2 space-y-1 text-sm text-fg-muted">
            {summary.improvements.map((dimension) => (
              <li key={dimension.key}>
                <strong className="tabular-nums text-fg">{dimension.score}/5</strong>{" "}
                {dimension.label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <section aria-labelledby="dimensions-title" className="mt-8">
        <h2 className="text-xl font-semibold text-fg" id="dimensions-title">
          Las nueve dimensiones en toda la tanda
        </h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {summary.dimensions.map((dimension) => (
            <article
              className="rounded-card border border-border bg-surface p-4"
              key={dimension.key}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-fg">{dimension.label}</h3>
                <span className="tabular-nums font-semibold text-fg">
                  {dimension.score === null ? "—" : `${dimension.score}/5`}
                </span>
              </div>
              {dimension.score === null ? null : <ScoreBar score={dimension.score} />}
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="questions-title" className="mt-8">
        <h2 className="text-xl font-semibold text-fg" id="questions-title">
          Pregunta por pregunta
        </h2>
        <ol className="mt-3 space-y-3">
          {summary.rows.map((row) => (
            <li key={row.question.id}>
              <details className="rounded-card border border-border bg-surface p-4">
                <summary className="cursor-pointer">
                  <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                    Pregunta {row.position} · {row.question.difficulty}
                    {row.question.productName ? ` · ${row.question.productName}` : null}
                  </span>
                  <span className="mt-1 flex flex-wrap items-baseline gap-2">
                    <strong className="font-semibold text-fg">{row.question.text}</strong>
                    <span className="tabular-nums font-semibold text-primary-deep">
                      {row.score === null ? "sin evaluar" : `${row.score}/5`}
                    </span>
                  </span>
                </summary>
                {row.answer ? (
                  <div className="mt-4 space-y-3">
                    <div>
                      <h4 className="text-sm font-semibold text-fg">Lo que respondiste</h4>
                      <p className="mt-1 text-fg-muted">{row.answer.advisorAnswer}</p>
                    </div>
                    {row.answer.feedback ? (
                      <div>
                        <h4 className="text-sm font-semibold text-fg">Feedback</h4>
                        <p className="mt-1 text-fg-muted">{row.answer.feedback}</p>
                      </div>
                    ) : null}
                    {row.answer.improvedAnswer ? (
                      <div className="rounded-card border border-success bg-confidence-high-bg p-3">
                        <h4 className="text-sm font-semibold text-confidence-high-fg">
                          Versión mejorada
                        </h4>
                        <p className="mt-1 text-fg">{row.answer.improvedAnswer}</p>
                      </div>
                    ) : null}
                    {row.answer.scores ? (
                      <ul className="grid gap-2 text-sm text-fg-muted sm:grid-cols-2">
                        {evaluationDimensionKeys.map((key) => {
                          const dimension = row.answer?.scores?.[key];
                          if (!dimension) return null;
                          return (
                            <li key={key}>
                              <strong className="text-fg">{trainingDimensionLabels[key]}</strong>{" "}
                              <span className="tabular-nums font-semibold text-primary-deep">
                                {dimension.score}/5
                              </span>
                              <span className="block">{dimension.reason}</span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 text-fg-muted">
                    No la respondiste. Sigue la práctica para contestarla.
                  </p>
                )}
              </details>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
