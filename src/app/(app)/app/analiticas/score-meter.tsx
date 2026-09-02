/**
 * El acierto como MEDIDOR, no como dona.
 *
 * Una dona para un solo numero es un pastel de dos tajadas: la referencia visual
 * usa una, y para un ratio contra un limite el medidor es la forma correcta.
 * Ademas puede mostrar algo que una dona no: la franja donde probablemente cae
 * el puntaje real mientras hay pocas respuestas para afirmarlo.
 */
export function ScoreMeter({
  percent,
  calibrating,
  answersToCalibrate,
}: {
  percent: number | null;
  calibrating: boolean;
  answersToCalibrate: number;
}) {
  if (percent === null) {
    return (
      <div className="rounded-card border border-border bg-surface p-6">
        <p className="text-sm text-fg-muted">Acierto</p>
        <p className="mt-1 text-5xl font-semibold text-fg">—</p>
        <p className="mt-3 max-w-md text-sm text-fg-muted">
          Todavía no hay respuestas evaluadas. El acierto aparece cuando complete su primera
          práctica: un cero diría que respondió mal, y no ha respondido.
        </p>
      </div>
    );
  }

  // La franja de calibracion: con pocas respuestas el promedio se mueve entero
  // con una respuesta mas, y el ancho de la franja es esa incertidumbre.
  const margen = calibrating ? Math.min(6 + answersToCalibrate * 2, 28) : 0;
  const desde = Math.max(percent - margen, 0);
  const hasta = Math.min(percent + margen, 100);

  return (
    <div className="rounded-card border border-border bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-fg-muted">Acierto</p>
          <p className="mt-1 text-5xl font-semibold text-fg">
            {percent}
            <span className="text-2xl font-normal text-fg-muted">/100</span>
          </p>
        </div>
        {calibrating ? (
          <p className="rounded-full border border-primary-tint-border bg-primary-tint px-3 py-1 text-xs font-semibold text-primary-deep">
            Calibrando
          </p>
        ) : null}
      </div>

      <div className="mt-5">
        {/*
          La barra es decoracion, no el dato: el numero y la franja de
          calibracion ya estan escritos arriba y abajo en texto. Marcarla como
          medidor accesible obligaria al elemento <meter> nativo, que no admite
          pintar dentro la franja de incertidumbre, y duplicaria en el lector de
          pantalla algo que ya se lee.
        */}
        <div aria-hidden="true" className="relative h-3 overflow-hidden rounded-full bg-border">
          {margen > 0 ? (
            <div
              aria-hidden="true"
              className="absolute inset-y-0 bg-primary-tint-border"
              style={{ left: `${desde}%`, width: `${hasta - desde}%` }}
            />
          ) : null}
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-3 max-w-lg text-sm text-fg-muted">
          {calibrating
            ? `Con las respuestas que hay, el puntaje real está probablemente entre ${desde} y ${hasta}. Faltan ${answersToCalibrate} respuestas para afirmarlo.`
            : "Promedio de las nueve dimensiones de la rúbrica, que califica cada respuesta de 1 a 5."}
        </p>
      </div>
    </div>
  );
}
