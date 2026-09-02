import type { FullAnswer } from "../../../../db/schema.ts";

/**
 * Respuesta modelo completa: como sonaria este producto explicado entero.
 *
 * Se muestra DE CORRIDO y no como nueve campos con etiqueta, porque su valor es
 * pedagogico: la asesora tiene que oir el ritmo de la respuesta hablada, y una
 * lista con encabezados se lee como una ficha tecnica, que es justo lo contrario
 * de lo que este bloque enseña. El desglose va debajo, en letra chica, para
 * quien quiera ver de que partes esta hecha.
 *
 * No es un guion que se repita en cada interaccion: el Copilot arma su respuesta
 * segun lo que pregunten y toma de aqui los bloques que necesite. Esto es la
 * referencia.
 */

const LABELS: Array<[keyof FullAnswer, string]> = [
  ["what_it_is", "Qué es"],
  ["what_for", "Para qué sirve"],
  ["benefits", "Beneficios"],
  ["science", "Por qué funciona"],
  ["different", "Qué lo hace distinto"],
  ["trust", "Por qué confiar"],
  ["commercial", "Presentación y precio"],
  ["cta", "Invitación"],
  ["warning", "Advertencia o límite"],
];

/** Unas 2,8 palabras por segundo hablando en camara, medido sobre las fichas. */
const WORDS_PER_SECOND = 2.8;

export function FullAnswerPanel({ fullAnswer }: { fullAnswer: FullAnswer }) {
  const blocks = LABELS.map(([key, label]) => ({
    label,
    text: (fullAnswer[key] ?? "").trim(),
  })).filter((block) => block.text !== "");
  const words = blocks.reduce((total, block) => total + block.text.split(/\s+/).length, 0);
  const seconds = Math.round(words / WORDS_PER_SECOND);

  return (
    <section className="mb-4 rounded-card border border-primary-deep bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-primary-deep">
          Respuesta modelo completa
        </h3>
        <p className="text-xs tabular-nums text-fg-muted">
          {seconds} s · {words} palabras
        </p>
      </div>
      <p className="mt-1 text-sm text-fg-muted">
        Así suena el producto explicado entero. No se repite tal cual: es la referencia de cómo
        responder bien.
      </p>

      {/* El texto corrido es lo que la asesora practica en voz alta. */}
      <p className="mt-4 text-[1.25rem] leading-relaxed text-fg">
        {blocks.map((block) => block.text).join(" ")}
      </p>

      <details className="mt-4 border-t border-border pt-3">
        <summary className="cursor-pointer text-sm font-medium text-primary">
          De qué partes está hecha
        </summary>
        <dl className="mt-3 space-y-2">
          {blocks.map((block, index) => (
            <div className="sm:grid sm:grid-cols-[11rem_1fr] sm:gap-4" key={block.label}>
              <dt className="text-xs uppercase tracking-wide text-fg-muted sm:pt-0.5">
                {index + 1}. {block.label}
              </dt>
              <dd
                className={
                  block.label === "Advertencia o límite"
                    ? "rounded-card border border-destructive bg-confidence-low-bg p-2 text-sm text-confidence-low-fg"
                    : "text-sm text-fg"
                }
              >
                {block.text}
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
