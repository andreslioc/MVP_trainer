/**
 * Preguntas del chat y si la asesora las respondio.
 *
 * Lo primero que se ve es el conteo de lo que quedo sin responder, y las filas
 * llegan ya ordenadas con esas arriba: el modulo existe para mostrar el hueco,
 * no el acierto.
 */

import { formatMark } from "../../../../lib/recordings.ts";

type ChatCoverageItem = {
  id: string;
  question: string;
  answered: boolean;
  evidenceQuote: string | null;
  /** Primera vez que la pregunta aparecio en el chat. */
  askedAtSeconds: number | null;
  /** Marcas de las apariciones posteriores de la misma pregunta. */
  repeatedAtSeconds: number[];
  atSeconds: number | null;
  /** Cuantas personas hicieron la misma pregunta. */
  askedCount: number;
};

export type { ChatCoverageItem };

export function ChatCoverageList({ items }: { items: ChatCoverageItem[] }) {
  if (items.length === 0) return null;
  const unanswered = items.filter((item) => !item.answered).length;

  return (
    <section aria-labelledby="chat-title">
      <h2 className="text-lg font-semibold text-fg" id="chat-title">
        Preguntas del chat
      </h2>
      <p className="mt-1 text-sm text-fg-muted">
        {unanswered === 0
          ? `${items.length} preguntas, todas respondidas.`
          : `${unanswered} de ${items.length} preguntas se quedaron sin respuesta.`}
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => {
          const askedAt = formatMark(item.askedAtSeconds);
          const repeatedAt = item.repeatedAtSeconds
            .map((atSeconds) => formatMark(atSeconds))
            .filter((mark): mark is string => mark !== null);
          const answeredAt = formatMark(item.atSeconds);
          return (
            <li
              className={`rounded-card border p-3 text-sm ${
                item.answered
                  ? "border-confidence-high-border bg-confidence-high-bg text-confidence-high-fg"
                  : "border-confidence-low-border bg-confidence-low-bg text-confidence-low-fg"
              }`}
              key={item.id}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0">{item.answered ? "✓" : "✗"}</span>
                <div className="flex-1">
                  <p className="font-semibold">
                    {item.question}
                    {item.askedCount > 1 ? (
                      <span className="ml-2 text-xs font-normal tabular-nums opacity-80">
                        la preguntaron {item.askedCount} veces
                      </span>
                    ) : null}
                  </p>
                  {!item.answered && askedAt ? (
                    <p className="mt-1 text-xs font-semibold tabular-nums opacity-90">
                      Primera vez: {askedAt}
                    </p>
                  ) : null}
                  {!item.answered && repeatedAt.length > 0 ? (
                    <p className="mt-1 text-xs tabular-nums opacity-90">
                      Se repitió en: {repeatedAt.join(", ")}
                    </p>
                  ) : null}
                  {item.evidenceQuote ? (
                    <p className="mt-1 text-xs opacity-90">
                      {answeredAt ? <span className="tabular-nums">{answeredAt} · </span> : null}
                      Respuesta: {item.evidenceQuote}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
