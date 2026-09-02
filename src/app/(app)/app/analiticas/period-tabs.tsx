import Link from "next/link";

import {
  ANALYTICS_PERIODS,
  type AnalyticsPeriod,
  PERIOD_LABELS,
} from "../../../../lib/analytics-period.ts";

/**
 * El selector de ventana del panel.
 *
 * Son enlaces y no un `select` con JavaScript: cada ventana es una URL propia,
 * asi que se puede compartir, marcar y abrir en otra pestaña, y la pagina sigue
 * siendo un Server Component sin hidratacion. El estado actual se marca con
 * `aria-current`, que es lo que lee un lector de pantalla, ademas del color.
 */
export function PeriodTabs({ advisorId, period }: { advisorId: string; period: AnalyticsPeriod }) {
  return (
    <nav aria-label="Periodo de las analíticas" className="mt-6">
      <ul className="flex flex-wrap gap-2">
        {ANALYTICS_PERIODS.map((opcion) => {
          const activo = opcion === period;
          return (
            <li key={opcion}>
              <Link
                aria-current={activo ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-card border px-4 text-sm font-medium ${
                  activo
                    ? "border-primary-deep bg-primary text-primary-fg"
                    : "border-border-control bg-surface text-fg hover:border-primary"
                }`}
                href={`/app/analiticas/${advisorId}?periodo=${opcion}`}
              >
                {PERIOD_LABELS[opcion]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
