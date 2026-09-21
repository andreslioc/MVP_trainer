import { Card } from "../../../../components/ui/card.tsx";
import { dimensionLabel } from "../../../../lib/dimension-labels.ts";
import type { ProgressComparison } from "../../../../lib/analytics-progress.ts";

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}

/** Lectura ejecutiva basada solo en notas comparables de la rúbrica. */
export function ProgressSummary({ progress }: { progress: ProgressComparison }) {
  if (progress.currentAnswers === 0) {
    return (
      <Card className="mt-4" density="compacta">
        <p className="font-semibold text-fg">
          Todavía no hay respuestas evaluadas en esta ventana.
        </p>
        <p className="mt-1 text-sm text-fg-muted">
          El resumen aparecerá cuando haya notas suficientes para señalar un avance o una prioridad.
        </p>
      </Card>
    );
  }

  const regressed = [...progress.trends]
    .filter((item) => item.delta !== null && item.delta < 0)
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))[0];
  const headline =
    progress.accuracyDelta === null
      ? "Ya hay una medición actual; falta el período anterior para describir el cambio."
      : progress.accuracyDelta > 2
        ? "En general, ahora responde mejor que en el período anterior."
        : progress.accuracyDelta < -2
          ? "En general, sus respuestas bajaron y conviene reforzar antes del próximo live."
          : "Su forma de responder se mantiene estable frente al período anterior.";

  return (
    <Card className="mt-4" density="compacta">
      <p className="font-semibold text-fg">{headline}</p>
      {progress.improved || regressed ? (
        <p className="mt-1 text-sm text-fg-muted">
          {progress.improved
            ? `Mejoró especialmente en ${dimensionLabel(progress.improved.dimension).toLocaleLowerCase("es-CO")}.`
            : "No aparece todavía una mejora puntual."}{" "}
          {regressed
            ? `El cambio que más necesita atención está en ${dimensionLabel(regressed.dimension).toLocaleLowerCase("es-CO")}.`
            : "No hubo retrocesos medibles en la rúbrica."}
        </p>
      ) : null}
      <div className="grid gap-5 md:grid-cols-3">
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Evolución</p>
          {progress.accuracyDelta === null ? (
            <p className="mt-2 font-semibold text-fg">Sin base anterior comparable</p>
          ) : (
            <p className="mt-2 text-2xl font-semibold text-fg">
              {signed(progress.accuracyDelta)} puntos
            </p>
          )}
          <p className="mt-1 text-sm text-fg-muted">{progress.label}</p>
        </div>

        <div className="border-t border-border pt-4 md:mt-5 md:border-l md:pl-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Mayor avance
          </p>
          {progress.improved ? (
            <>
              <p className="mt-2 font-semibold text-fg">
                {dimensionLabel(progress.improved.dimension)}
              </p>
              <p className="mt-1 text-sm text-fg-muted">
                {signed(progress.improved.delta ?? 0)} en la escala de 1 a 5
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">
              Aún no aparece una mejora medible frente al periodo anterior.
            </p>
          )}
        </div>

        <div className="border-t border-border pt-4 md:mt-5 md:border-l md:pl-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Prioridad actual
          </p>
          {progress.focus ? (
            <>
              <p className="mt-2 font-semibold text-fg">
                {dimensionLabel(progress.focus.dimension)}
              </p>
              <p className="mt-1 text-sm text-fg-muted">
                {progress.focus.average} / 5 · la dimensión más baja del periodo
              </p>
            </>
          ) : null}
        </div>
      </div>
      <p className="mt-5 border-t border-border pt-4 text-sm text-fg-muted">
        Comparación basada en {progress.currentAnswers} respuestas recientes y{" "}
        {progress.previousAnswers} del periodo anterior. El tiempo muestra dedicación; las notas
        muestran desempeño.
      </p>
    </Card>
  );
}
