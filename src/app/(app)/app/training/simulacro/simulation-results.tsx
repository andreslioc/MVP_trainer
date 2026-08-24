/**
 * Resultado del simulacro: dos notas de naturaleza distinta.
 *
 * La atencion se MIDE —aparecio en el segundo X, contesto en el Y— y no la
 * opina ningun modelo: son datos del guion contra la transcripcion, y por eso
 * van primero. La calidad de la respuesta si la evalua el modelo, con las mismas
 * nueve dimensiones del Simulator.
 */

import { formatMark, humanizeMark } from "../../../../../lib/recordings.ts";

export type ResultRow = {
  question_id: string;
  appeared_at_s: number;
  answered: boolean;
  answered_at_s: number | null;
  reaction_s: number | null;
  advisor_answer: string | null;
  scores: Record<string, { score: number; reason: string }> | null;
  feedback: string | null;
};

const DIMENSION_LABEL: Record<string, string> = {
  conocimiento_producto: "Conocimiento",
  claridad_explicacion: "Claridad",
  naturalidad_cercania: "Naturalidad",
  uso_responsable_evidencia: "Evidencia",
  manejo_objeciones: "Objeciones",
  capacidad_persuasion: "Persuasión",
  uso_cta: "CTA",
  duracion: "Duración",
  cumplimiento_reglas_marca: "Reglas de marca",
};

function average(rows: readonly ResultRow[]) {
  const values = rows.flatMap((row) =>
    row.scores ? Object.values(row.scores).map((entry) => entry.score) : [],
  );
  if (values.length === 0) return null;
  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10;
}

export function SimulationResults({
  results,
  transcript,
  onRestart,
}: {
  results: readonly ResultRow[];
  /** Lo que se transcribio de tu voz. Vacio significa que no se capturo audio. */
  transcript: string | null;
  onRestart: () => void;
}) {
  const lineas = (transcript ?? "")
    .split("\n")
    .map((linea, index) => ({ id: index, texto: humanizeMark(linea.trim()) }))
    .filter((linea) => linea.texto);
  const answered = results.filter((row) => row.answered);
  const reactions = answered
    .map((row) => row.reaction_s)
    .filter((value): value is number => value !== null);
  const media = average(results);

  return (
    <div className="mt-8 max-w-3xl space-y-6">
      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="text-xl font-semibold text-fg">Atención al chat</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Esto no lo opina la IA: es el segundo en que apareció cada pregunta contra el segundo en
          que la contestaste.
        </p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-fg-muted">Respondidas</dt>
            <dd className="text-2xl font-semibold tabular-nums text-fg">
              {answered.length} de {results.length}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-fg-muted">Se te pasaron</dt>
            <dd className="text-2xl font-semibold tabular-nums text-fg">
              {results.length - answered.length}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-fg-muted">Reacción promedio</dt>
            <dd className="text-2xl font-semibold tabular-nums text-fg">
              {reactions.length === 0
                ? "—"
                : `${Math.round(reactions.reduce((total, value) => total + value, 0) / reactions.length)} s`}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-card border border-border bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold text-fg">Cómo respondiste</h2>
          {media === null ? null : (
            <span className="text-sm text-fg-muted">
              Promedio <strong className="tabular-nums text-fg">{media}</strong> / 5
            </span>
          )}
        </div>

        <ul className="mt-4 space-y-4">
          {results.map((row) => (
            <li
              className={`rounded-card border p-4 ${
                row.answered
                  ? "border-confidence-high-border bg-confidence-high-bg"
                  : "border-confidence-low-border bg-confidence-low-bg"
              }`}
              key={row.question_id}
            >
              <p className="text-sm font-semibold tabular-nums">
                Apareció en {formatMark(row.appeared_at_s)}
                {row.answered ? (
                  <> · contestaste {row.reaction_s} s después</>
                ) : (
                  <> · no la contestaste</>
                )}
              </p>
              {row.advisor_answer ? (
                <p className="mt-2 text-sm">
                  Dijiste: <em>{row.advisor_answer}</em>
                </p>
              ) : null}
              {row.scores ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(row.scores).map(([key, value]) => (
                    <li
                      className="rounded-card bg-surface px-2 py-1 text-xs tabular-nums text-fg"
                      key={key}
                      title={value.reason}
                    >
                      {DIMENSION_LABEL[key] ?? key} {value.score}/5
                    </li>
                  ))}
                </ul>
              ) : null}
              {row.feedback ? <p className="mt-2 text-sm">{row.feedback}</p> : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="text-xl font-semibold text-fg">Lo que se te escuchó</h2>
        {lineas.length === 0 ? (
          <p className="mt-2 rounded-card border border-confidence-low-border bg-confidence-low-bg p-3 text-sm text-confidence-low-fg">
            No se transcribió nada. O el micrófono no capturó audio, o no se alcanzó a oír lo que
            dijiste. Revisa el medidor de micrófono al empezar el próximo simulacro: si no se mueve
            al hablar, el problema está ahí.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-fg-muted">
              La transcripción completa, con el minuto de cada frase. Es la misma contra la que se
              midió si respondiste.
            </p>
            <ol className="mt-3 max-h-80 space-y-1 overflow-y-auto text-sm tabular-nums">
              {lineas.map((linea) => (
                <li className="border-b border-border pb-1 last:border-0" key={linea.id}>
                  {linea.texto}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <button
        className="min-h-11 rounded-card bg-primary px-5 font-semibold text-primary-fg"
        onClick={onRestart}
        type="button"
      >
        Otro simulacro
      </button>
    </div>
  );
}
