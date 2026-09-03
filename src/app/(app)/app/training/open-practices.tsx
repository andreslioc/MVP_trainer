import Link from "next/link";

/**
 * Practicas que quedaron a medias.
 *
 * Salir de una practica ya no la pierde: la sesion sigue abierta y esta lista es
 * la unica puerta de vuelta —el recorrido es lineal y no hay una URL con la
 * pregunta que se puede guardar. Cada fila ofrece las dos salidas reales:
 * terminarla, o cerrarla con lo que hay y ver el consolidado.
 */
export type OpenPractice = {
  id: string;
  title: string;
  practiceSize: number | null;
  answered: number;
  startedAt: Date;
};

const formatter = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function OpenPractices({ practices }: { practices: readonly OpenPractice[] }) {
  if (practices.length === 0) return null;

  return (
    <section
      aria-labelledby="open-practices-title"
      className="mt-8 rounded-card border border-primary bg-surface p-5"
    >
      <h2 className="text-xl font-semibold text-fg" id="open-practices-title">
        Tienes práctica sin terminar
      </h2>
      <p className="mt-1 text-sm text-fg-muted">
        Retómala donde la dejaste: cae en la primera pregunta que te falta.
      </p>
      <ul className="mt-4 space-y-3">
        {practices.map((practice) => (
          <li
            className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-background p-4"
            key={practice.id}
          >
            <div>
              <p className="font-semibold text-fg">{practice.title}</p>
              <p className="text-sm text-fg-muted">
                <strong className="tabular-nums text-fg">{practice.answered}</strong>
                {practice.practiceSize ? (
                  <>
                    {" de "}
                    <strong className="tabular-nums text-fg">{practice.practiceSize}</strong>
                  </>
                ) : null}{" "}
                respondidas · abierta el {formatter.format(practice.startedAt)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                className="inline-flex min-h-11 items-center rounded-card bg-primary px-4 font-semibold text-primary-fg hover:bg-primary-deep"
                href={`/app/training/${practice.id}`}
              >
                Terminar práctica
              </Link>
              <Link
                className="inline-flex min-h-11 items-center rounded-card border border-border-control px-4 font-semibold text-primary-deep"
                href={`/app/training/${practice.id}/resumen`}
              >
                Ver resumen
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
