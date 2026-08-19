"use client";

import { useRef, useState, useTransition } from "react";

import {
  megabytes,
  MAX_RECORDING_BYTES,
  RECORDING_ACCEPT,
  recordingFileProblem,
} from "../../../../lib/recordings.ts";
import { ingestTranscriptAction, uploadRecordingAction } from "./actions.ts";

type Mode = "transcript" | "audio";

export function RecordingIntake({ callbackReady }: { callbackReady: boolean }) {
  const [mode, setMode] = useState<Mode>("transcript");
  const [transcript, setTranscript] = useState("");
  const [chatLog, setChatLog] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  function report(ok: boolean, text: string) {
    setFailed(!ok);
    setMessage(text);
  }

  function submitTranscript(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await ingestTranscriptAction({
        transcript,
        chatLog: chatLog.trim() || undefined,
      });
      if (result.ok) {
        setTranscript("");
        setChatLog("");
        report(true, "Transcripción cargada. Ya puedes analizarla.");
      } else {
        report(false, result.error.message);
      }
    });
  }

  function submitAudio(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const file = fileInput.current?.files?.[0];
    if (!file) {
      report(false, "Selecciona un archivo.");
      return;
    }
    // Rechazar aqui y no en el servidor: un cuerpo que excede el tope de la
    // server action se corta a medias y falla con un error de multipart que no
    // dice nada sobre el tamano.
    const problem = recordingFileProblem(file);
    if (problem) {
      report(false, problem);
      return;
    }
    const data = new FormData();
    data.set("file", file);
    startTransition(async () => {
      const result = await uploadRecordingAction(data);
      report(
        result.ok,
        result.ok
          ? "Grabación subida y comprimida. Dale «Transcribir ahora» en la lista de grabaciones."
          : result.error.message,
      );
    });
  }

  return (
    <section
      aria-labelledby="intake-title"
      className="rounded-card border border-border bg-surface p-6"
    >
      <h2 className="text-lg font-semibold text-fg" id="intake-title">
        Cargar un live
      </h2>

      <div className="mt-4 flex gap-2" role="tablist">
        <button
          aria-selected={mode === "transcript"}
          className={`rounded-card border px-3 py-2 text-sm font-semibold ${mode === "transcript" ? "border-primary bg-primary text-white" : "border-border text-fg-muted"}`}
          onClick={() => setMode("transcript")}
          role="tab"
          type="button"
        >
          Pegar transcripción
        </button>
        <button
          aria-selected={mode === "audio"}
          className={`rounded-card border px-3 py-2 text-sm font-semibold ${mode === "audio" ? "border-primary bg-primary text-white" : "border-border text-fg-muted"}`}
          onClick={() => setMode("audio")}
          role="tab"
          type="button"
        >
          Subir audio o video
        </button>
      </div>

      {mode === "transcript" ? (
        <form className="mt-4" onSubmit={submitTranscript}>
          <label className="block text-sm font-semibold text-fg" htmlFor="transcript">
            Transcripción del live
          </label>
          <p className="mt-1 text-sm text-fg-muted">
            Pega el texto de lo que se dijo. Sirve para analizar un live sin depender del proveedor
            de transcripción, y produce exactamente los mismos hallazgos.
          </p>
          <textarea
            className="mt-2 min-h-48 w-full rounded-card border border-border-control bg-surface p-3 text-fg"
            disabled={pending}
            id="transcript"
            onChange={(event) => setTranscript(event.target.value)}
            placeholder="[Speaker 0] Hola a todas, hoy tenemos la creatina…"
            value={transcript}
          />
          <label className="mt-4 block text-sm font-semibold text-fg" htmlFor="chat-log">
            Chat del live (opcional)
          </label>
          <p className="mt-1 text-sm text-fg-muted">
            Pega los mensajes del chat para analizar cuáles preguntas fueron respondidas. Un mensaje
            por línea.
          </p>
          <textarea
            className="mt-2 min-h-24 w-full rounded-card border border-border-control bg-surface p-3 text-fg"
            disabled={pending}
            id="chat-log"
            onChange={(event) => setChatLog(event.target.value)}
            placeholder="usuario123: ¿es seguro en el embarazo?&#10;maria_shop: ¿cuál es el beneficio?"
            value={chatLog}
          />
          <button
            className="mt-3 min-h-11 rounded-card bg-primary px-5 font-semibold text-white disabled:opacity-60"
            disabled={pending || transcript.trim().length < 40}
            type="submit"
          >
            {pending ? "Cargando…" : "Cargar transcripción"}
          </button>
        </form>
      ) : (
        <form className="mt-4" onSubmit={submitAudio}>
          <label className="block text-sm font-semibold text-fg" htmlFor="recording-file">
            Grabación descargada del live
          </label>
          <p className="mt-1 text-sm text-fg-muted">
            mp3, m4a, wav, webm o mp4, hasta {megabytes(MAX_RECORDING_BYTES)} MB. Se guarda en un
            bucket privado bajo tu usuario.
          </p>
          {!callbackReady ? (
            <p
              className="mt-3 rounded-card border border-warning-border bg-confidence-mid-bg p-3 text-sm text-confidence-mid-fg"
              role="status"
            >
              El proveedor de transcripción no puede alcanzar esta aplicación desde internet, así
              que la transcripción no llega sola. Sube el archivo y luego dale{" "}
              <strong>Transcribir ahora</strong> en la lista de grabaciones: el audio se manda
              directo y el texto vuelve en el momento.
            </p>
          ) : null}
          <input
            accept={RECORDING_ACCEPT}
            className="mt-3 block w-full cursor-pointer rounded-card border border-border-control bg-surface p-3 text-fg"
            id="recording-file"
            name="file"
            ref={fileInput}
            type="file"
          />
          <button
            className="mt-3 min-h-11 rounded-card bg-primary px-5 font-semibold text-white disabled:opacity-60"
            disabled={pending}
            type="submit"
          >
            {pending ? "Subiendo…" : "Subir grabación"}
          </button>
        </form>
      )}

      {message ? (
        <p
          className={`mt-4 rounded-card border p-3 text-sm ${failed ? "border-destructive bg-confidence-low-bg text-confidence-low-fg" : "border-success bg-confidence-high-bg text-confidence-high-fg"}`}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
