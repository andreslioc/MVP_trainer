"use client";

/**
 * Una grabacion en la lista de Live Intelligence.
 *
 * Vive aparte porque acumulo todo lo que se puede hacer con una grabacion
 * —transcribir, analizar, mirar su texto, borrarla— y el panel que la contiene
 * ya pasaba de trescientas lineas. Aqui cada accion queda a la vista junta.
 */

import Link from "next/link";

import { TranscriptViewer } from "./transcript-viewer.tsx";

export type Recording = {
  id: string;
  title: string | null;
  status: string;
  durationS: number | null;
  createdAt: Date;
  hasTranscript: boolean;
  hasChatLog: boolean;
};

export function RecordingCard({
  recording,
  selectedId,
  pending,
  statusLabel,
  stamp,
  duration,
  onTranscribe,
  onAnalyze,
  onRemove,
}: {
  recording: Recording;
  selectedId: string | null;
  pending: boolean;
  statusLabel: string;
  stamp: (createdAt: Date) => string;
  duration: (durationS: number | null) => string;
  onTranscribe: (recordingId: string) => void;
  onAnalyze: (recordingId: string) => void;
  onRemove: (recordingId: string, label: string) => void;
}) {
  const label = recording.title ?? stamp(recording.createdAt);

  return (
    <li
      className={`rounded-card border bg-surface p-4 ${
        recording.id === selectedId ? "border-primary" : "border-border"
      }`}
      key={recording.id}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {recording.title ? <p className="font-semibold text-fg">{recording.title}</p> : null}
          <p className={recording.title ? "mt-1 text-sm text-fg-muted" : "font-semibold text-fg"}>
            {stamp(recording.createdAt)} · {duration(recording.durationS)}
          </p>
          <p className="mt-1 text-sm text-fg-muted">{statusLabel}</p>
        </div>
        <div className="flex flex-shrink-0 items-start gap-1">
          <button
            aria-label={`Borrar ${label}`}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-card border border-border text-fg-muted hover:border-destructive hover:text-destructive disabled:opacity-60"
            disabled={pending}
            onClick={() => onRemove(recording.id, label)}
            title="Borrar grabación"
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="18"
              stroke="currentColor"
              strokeWidth="1.75"
              viewBox="0 0 24 24"
              width="18"
            >
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
          {recording.hasTranscript ? (
            <TranscriptViewer
              hasChatLog={recording.hasChatLog}
              label={label}
              recordingId={recording.id}
            />
          ) : null}
        </div>
      </div>
      {recording.status === "uploaded" ||
      recording.status === "transcribing" ||
      recording.status === "failed" ? (
        <button
          className="mt-3 min-h-11 rounded-card border border-primary px-3 py-2 text-sm font-semibold text-primary disabled:opacity-60"
          disabled={pending}
          onClick={() => onTranscribe(recording.id)}
          type="button"
        >
          {pending ? "Transcribiendo…" : "Transcribir ahora"}
        </button>
      ) : null}
      {recording.status === "analyzed" && recording.id !== selectedId ? (
        <Link
          className="mt-3 inline-block min-h-11 rounded-card border border-primary px-3 py-2 text-sm font-semibold text-primary"
          href={`/app/intelligence?grabacion=${recording.id}`}
          // Sin esto Next sube al inicio al navegar. La lista de
          // grabaciones vive por debajo del pliegue, asi que elegir una
          // te sacaba del sitio donde estabas mirando.
          scroll={false}
        >
          Ver hallazgos
        </Link>
      ) : null}
      {recording.status === "analyzed" && recording.id === selectedId ? (
        <p className="mt-3 text-sm font-semibold text-primary">Viendo sus hallazgos</p>
      ) : null}
      {recording.status === "transcribed" ? (
        <button
          className="mt-3 rounded-card bg-primary px-3 py-2 text-sm font-semibold text-primary-fg disabled:opacity-60"
          disabled={pending}
          onClick={() => onAnalyze(recording.id)}
          type="button"
        >
          {pending ? "Analizando…" : "Analizar grabación"}
        </button>
      ) : null}
    </li>
  );
}
