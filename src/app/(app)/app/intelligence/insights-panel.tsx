"use client";

import { useState, useTransition } from "react";

import { isPromotable, notPromotableReason } from "../../../../lib/insights.ts";
import { analyzeRecordingAction, promoteInsightAction } from "./actions.ts";

type Recording = {
  id: string;
  status: string;
  durationS: number | null;
  createdAt: Date;
};

type Insight = {
  id: string;
  type: string;
  text: string;
  productId: string | null;
  productName: string | null;
  frequency: number;
  promotedToQuestionId: string | null;
};

type ChatCoverage = {
  id: string;
  question: string;
  answered: boolean;
  evidenceQuote: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  faq: "Pregunta frecuente",
  objecion: "Objeción",
  error: "Respuesta a corregir",
  oportunidad: "Oportunidad",
  buena_practica: "Buena práctica",
  riesgo_claim: "Riesgo de afirmación",
};

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Subida",
  transcribing: "Transcribiendo",
  transcribed: "Lista para analizar",
  analyzing: "Analizando",
  analyzed: "Analizada",
  failed: "Falló",
};

function duration(seconds: number | null) {
  if (seconds === null) return "duración desconocida";
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min`;
}

export function InsightsPanel({
  recordings,
  insights,
  chatCoverage,
  selectedId,
}: {
  recordings: Recording[];
  insights: Insight[];
  chatCoverage: ChatCoverage[];
  selectedId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function analyze(recordingId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await analyzeRecordingAction(recordingId);
      if (!result.ok) setMessage(result.error.message);
    });
  }

  function promote(insightId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await promoteInsightAction(insightId);
      setMessage(
        result.ok
          ? result.data.created
            ? "Hallazgo promovido a pregunta de entrenamiento."
            : "Este hallazgo ya estaba enlazado a una pregunta."
          : result.error.message,
      );
    });
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[20rem_1fr]">
      <section aria-labelledby="recordings-title">
        <h2 className="text-lg font-semibold text-fg" id="recordings-title">
          Grabaciones
        </h2>
        {recordings.length === 0 ? (
          <p className="mt-3 text-fg-muted">Todavía no has subido ninguna grabación.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {recordings.map((recording) => (
              <li className="rounded-card border border-border bg-surface p-4" key={recording.id}>
                <p className="font-semibold text-fg">
                  {recording.createdAt.toLocaleDateString("es-CO")} ·{" "}
                  {duration(recording.durationS)}
                </p>
                <p className="mt-1 text-sm text-fg-muted">
                  {STATUS_LABEL[recording.status] ?? recording.status}
                </p>
                {recording.status === "transcribed" ? (
                  <button
                    className="mt-3 rounded-card bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    disabled={pending}
                    onClick={() => analyze(recording.id)}
                    type="button"
                  >
                    {pending ? "Analizando…" : "Analizar grabación"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="insights-title">
        <h2 className="text-lg font-semibold text-fg" id="insights-title">
          Hallazgos
        </h2>
        {message ? (
          <p
            className="mt-3 rounded-card border border-border bg-surface p-3 text-fg"
            role="status"
          >
            {message}
          </p>
        ) : null}
        {selectedId === null ? (
          <p className="mt-3 text-fg-muted">Analiza una grabación para ver sus hallazgos.</p>
        ) : insights.length === 0 ? (
          <p className="mt-3 text-fg-muted">Esta grabación no produjo hallazgos.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {insights.map((insight) => (
              <li className="rounded-card border border-border bg-surface p-4" key={insight.id}>
                <p className="text-sm font-semibold text-primary">
                  {TYPE_LABEL[insight.type] ?? insight.type} · {insight.frequency}×
                </p>
                <p className="mt-1 text-fg">{insight.text}</p>
                {insight.productName ? (
                  <p className="mt-1 text-sm text-fg-muted">{insight.productName}</p>
                ) : null}
                {insight.promotedToQuestionId ? (
                  <p className="mt-3 text-sm font-semibold text-confidence-high-fg">
                    Ya es pregunta de entrenamiento
                  </p>
                ) : isPromotable(insight) ? (
                  <button
                    className="mt-3 rounded-card border border-primary px-3 py-2 text-sm font-semibold text-primary disabled:opacity-60"
                    disabled={pending}
                    onClick={() => promote(insight.id)}
                    type="button"
                  >
                    Promover a entrenamiento
                  </button>
                ) : (
                  <p className="mt-3 text-sm text-fg-muted">{notPromotableReason(insight)}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {chatCoverage.length > 0 ? (
        <section aria-labelledby="chat-title">
          <h2 className="text-lg font-semibold text-fg" id="chat-title">
            Preguntas del chat
          </h2>
          <ul className="mt-3 space-y-2">
            {chatCoverage.map((item) => (
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
                    <p className="font-semibold">{item.question}</p>
                    {item.evidenceQuote ? (
                      <p className="mt-1 text-xs opacity-90">Respuesta: {item.evidenceQuote}</p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
