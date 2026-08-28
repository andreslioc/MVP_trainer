"use client";

export type CopilotVariant = "express" | "estandar" | "profunda";

export type CopilotCompositionView = {
  express: string;
  estandar: string;
  profunda: string;
  confidence: "alto" | "medio" | "revisar";
  cta_used: string | null;
  rule_applied: string | null;
};

export type ResponsibleAlertView = { code: string; message: string };

const confidenceClass = {
  alto: "confidence-badge-high",
  medio: "confidence-badge-mid",
  revisar: "confidence-badge-low",
};

export function AnswerPanel({
  variant,
  streamedText,
  composition,
  durations,
  isStreaming,
  error,
  alerts,
}: {
  variant: CopilotVariant;
  streamedText: string;
  composition?: CopilotCompositionView;
  durations?: Record<CopilotVariant, number>;
  isStreaming: boolean;
  error?: string;
  alerts?: ResponsibleAlertView[];
}) {
  const answer = composition?.[variant] ?? streamedText;

  return (
    <section
      aria-live="polite"
      className="min-h-96 rounded-card border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary">Respuesta lista para decir</p>
          <h2 className="mt-1 text-xl font-semibold capitalize text-fg">Vista {variant}</h2>
        </div>
        {composition ? (
          <span className={`confidence-badge ${confidenceClass[composition.confidence]}`}>
            Confianza: {composition.confidence}
          </span>
        ) : null}
      </div>

      {error ? (
        <div
          className="mt-6 rounded-card border border-destructive bg-confidence-low-bg p-4"
          role="alert"
        >
          <p className="font-semibold text-confidence-low-fg">No se pudo generar.</p>
          {/* La coletilla va aparte: el mensaje del servidor puede terminar en
              dos puntos y una cita, y concatenarlos dejaba "…su calidad Tu
              pregunta sigue en el formulario." */}
          <p className="mt-1 text-sm text-confidence-low-fg">{error}</p>
          <p className="mt-1 text-sm text-confidence-low-fg">Tu pregunta sigue en el formulario.</p>
        </div>
      ) : answer ? (
        <p className="mt-6 whitespace-pre-wrap text-xl leading-relaxed text-fg">{answer}</p>
      ) : (
        <p className="mt-6 rounded-card border border-border bg-background p-4 text-fg-muted">
          La respuesta aparece aquí. Escribe la pregunta de la clienta y presiona Generar.
        </p>
      )}

      {isStreaming ? <p className="mt-4 text-sm text-fg-muted">Generando en vivo…</p> : null}

      {alerts?.length ? (
        <div className="mt-5 rounded-card border border-warning-border bg-confidence-mid-bg p-4">
          <p className="font-semibold text-confidence-mid-fg">Revisión responsable</p>
          <ul className="mt-2 space-y-1 text-sm text-confidence-mid-fg">
            {alerts.map((alert) => (
              <li key={alert.code}>
                {alert.code}: {alert.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {composition && durations ? (
        <>
          <dl className="mt-6 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-fg">Duración estimada</dt>
              <dd className="text-fg-muted">{durations[variant]} segundos</dd>
            </div>
            <div>
              <dt className="font-semibold text-fg">CTA usado</dt>
              <dd className="text-fg-muted">{composition.cta_used ?? "Sin CTA"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-fg">Regla aplicada</dt>
              <dd className="text-fg-muted">{composition.rule_applied ?? "Ninguna"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-fg">Estado</dt>
              <dd className="text-fg-muted">Respuesta guardada</dd>
            </div>
          </dl>
          <button
            className="mt-5 min-h-11 rounded-card border border-border-control px-4 font-semibold text-primary-deep"
            onClick={() => navigator.clipboard.writeText(answer)}
            type="button"
          >
            Copiar respuesta
          </button>
        </>
      ) : null}
    </section>
  );
}
