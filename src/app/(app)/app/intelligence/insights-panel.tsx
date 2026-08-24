"use client";

import { useState, useTransition } from "react";

import { isPromotable, notPromotableReason } from "../../../../lib/insights.ts";
import { formatMark } from "../../../../lib/recordings.ts";
import { ChatCoverageList, type ChatCoverageItem } from "./chat-coverage-list.tsx";
import { RecordingCard, type Recording } from "./recording-card.tsx";
import {
  analyzeRecordingAction,
  deleteRecordingAction,
  promoteInsightAction,
  transcribeRecordingAction,
} from "./actions.ts";

type Insight = {
  id: string;
  type: string;
  text: string;
  productId: string | null;
  productName: string | null;
  frequency: number;
  atSeconds: number | null;
  promotedToQuestionId: string | null;
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

/**
 * Con varias grabaciones del mismo dia la fecha sola no distingue nada, y el
 * nombre del archivo tampoco: las descargas de un live se llaman todas igual.
 * La hora es lo unico que siempre esta y siempre desambigua.
 */
/**
 * Minuto y segundo del live, no segundos crudos: es como esta rotulada la barra
 * de un reproductor, y el hallazgo existe para poder ir a ese punto del video.
 */
function stamp(createdAt: Date) {
  return `${createdAt.toLocaleDateString("es-CO")} · ${createdAt.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function InsightsPanel({
  recordings,
  insights,
  chatCoverage,
  selectedId,
}: {
  recordings: Recording[];
  insights: Insight[];
  chatCoverage: ChatCoverageItem[];
  selectedId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  /**
   * Borra la grabacion y todo lo que colgaba de ella.
   *
   * Confirma antes porque no hay deshacer: se va el audio, la transcripcion,
   * los hallazgos y las preguntas del chat. Lo unico que sobrevive son las
   * preguntas de practica ya promovidas, que son material propio.
   */
  function remove(recordingId: string, label: string) {
    if (!window.confirm(`¿Borrar «${label}» con su transcripción y sus hallazgos?`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await deleteRecordingAction(recordingId);
      setMessage(
        result.ok
          ? result.data.keptQuestions > 0
            ? `Grabación borrada. Se conservaron ${result.data.keptQuestions} preguntas de práctica.`
            : "Grabación borrada."
          : result.error.message,
      );
    });
  }

  function analyze(recordingId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await analyzeRecordingAction(recordingId);
      if (!result.ok) setMessage(result.error.message);
    });
  }

  function transcribe(recordingId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await transcribeRecordingAction(recordingId);
      setMessage(result.ok ? "Grabación transcrita. Ya puedes analizarla." : result.error.message);
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
              <RecordingCard
                duration={duration}
                key={recording.id}
                onAnalyze={analyze}
                onRemove={remove}
                onTranscribe={transcribe}
                pending={pending}
                recording={recording}
                selectedId={selectedId}
                stamp={stamp}
                statusLabel={STATUS_LABEL[recording.status] ?? recording.status}
              />
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
                  {formatMark(insight.atSeconds) ? (
                    <span className="ml-2 tabular-nums font-normal text-fg-muted">
                      {formatMark(insight.atSeconds)}
                    </span>
                  ) : null}
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

      <ChatCoverageList items={chatCoverage} />
    </div>
  );
}
