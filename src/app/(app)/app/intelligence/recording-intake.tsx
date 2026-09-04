"use client";

import { useRef, useState, useTransition } from "react";

import { megabytes, RECORDING_ACCEPT, recordingFileProblem } from "../../../../lib/recordings.ts";
import {
  ingestTranscriptAction,
  prepareRecordingUploadAction,
  registerRecordingAction,
} from "./actions.ts";
import {
  canConvertInBrowser,
  type ConversionProgress,
  convertToLightAudio,
  readDurationSeconds,
} from "../../../../lib/audio-convert.ts";
import { ChatLogField } from "./chat-log-field.tsx";

type Mode = "transcript" | "audio";

export function RecordingIntake({
  callbackReady,
  maxUploadBytes,
}: {
  callbackReady: boolean;
  /** Tope real del bucket, decidido por el plan de Supabase. */
  maxUploadBytes: number;
}) {
  const [mode, setMode] = useState<Mode>("transcript");
  const [transcript, setTranscript] = useState("");
  const [chatLog, setChatLog] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [conversion, setConversion] = useState<ConversionProgress | null>(null);
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
        title: title.trim() || undefined,
      });
      if (result.ok) {
        setTranscript("");
        setChatLog("");
        setTitle("");
        report(true, "Transcripción cargada. Ya puedes analizarla.");
      } else {
        report(false, result.error.message);
      }
    });
  }

  /**
   * Sube en dos pasos porque el archivo NO puede pasar por el servidor: Vercel
   * corta cualquier cuerpo sobre ~4,5 MB antes de que el codigo corra, y un
   * audio de live comprimido ronda los 17 MB. El servidor solo firma la URL; el
   * archivo va del navegador a Storage directo.
   */
  function submitAudio(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setConversion(null);
    const elegido = fileInput.current?.files?.[0];
    if (!elegido) {
      report(false, "Selecciona un archivo.");
      return;
    }
    const problem = recordingFileProblem(elegido, maxUploadBytes, canConvertInBrowser());
    if (problem) {
      report(false, problem);
      return;
    }

    startTransition(async () => {
      // Un video de live pesa cientos de megas y el 98% es imagen que nadie
      // transcribe. Se convierte aqui, antes de subir: convertirlo despues
      // exigiria que ya estuviera en Storage, que es donde pega el tope.
      let file = elegido;
      if (elegido.size > maxUploadBytes) {
        setConversion({ ratio: 0, processedS: 0 });
        const converted = await convertToLightAudio(elegido, setConversion);
        setConversion(null);
        if (!converted.ok) {
          report(false, converted.message);
          return;
        }
        file = converted.file;
      }

      const prepared = await prepareRecordingUploadAction({
        contentType: file.type,
        sizeBytes: file.size,
      });
      if (!prepared.ok) {
        report(false, prepared.error.message);
        return;
      }

      let uploaded: Response;
      try {
        // Sin cabeceras de autenticacion: el permiso viaja en el token de la
        // URL firmada, y por eso esta subida no toca el servidor de la app.
        uploaded = await fetch(prepared.data.uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "content-type": file.type },
        });
      } catch {
        report(false, "Se cortó la subida. Revisa tu conexión y vuelve a intentar.");
        return;
      }
      if (!uploaded.ok) {
        report(false, "Storage rechazó el archivo. Puede pesar más de lo permitido.");
        return;
      }

      // Se lee del archivo que se subio, no del original: si se convirtio, es
      // el mismo audio y la misma duracion.
      const durationS = await readDurationSeconds(file);

      const result = await registerRecordingAction({
        recordingId: prepared.data.recordingId,
        storagePath: prepared.data.storagePath,
        durationS: durationS ?? undefined,
        chatLog: chatLog.trim() || undefined,
        title: title.trim() || undefined,
      });
      if (result.ok) {
        setChatLog("");
        setTitle("");
      }
      report(
        result.ok,
        result.ok
          ? `Grabación subida${file !== elegido ? ` (${megabytes(elegido.size)} MB → ${megabytes(file.size)} MB)` : ""}. Dale «Transcribir ahora» en la lista de grabaciones.`
          : result.error.message,
      );
    });
  }

  const nameField = (id: string) => (
    <>
      <label className="mt-4 block text-sm font-semibold text-fg" htmlFor={id}>
        Nombre del live (opcional)
      </label>
      <input
        className="mt-2 w-full rounded-card border border-border-control bg-surface p-3 text-fg"
        disabled={pending}
        id={id}
        maxLength={120}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Live de creatina, martes por la tarde"
        type="text"
        value={title}
      />
    </>
  );

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
          className={`rounded-card border px-3 py-2 text-sm font-semibold ${mode === "transcript" ? "border-primary bg-primary text-primary-fg" : "border-border text-fg-muted"}`}
          onClick={() => setMode("transcript")}
          role="tab"
          type="button"
        >
          Pegar transcripción
        </button>
        <button
          aria-selected={mode === "audio"}
          className={`rounded-card border px-3 py-2 text-sm font-semibold ${mode === "audio" ? "border-primary bg-primary text-primary-fg" : "border-border text-fg-muted"}`}
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
          {nameField("title-transcript")}
          <ChatLogField disabled={pending} id="chat-log" onChange={setChatLog} value={chatLog} />
          <button
            className="mt-3 min-h-11 rounded-card bg-primary px-5 font-semibold text-primary-fg disabled:opacity-60"
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
            mp3, m4a, wav, webm o mp4. Si el archivo pesa más de {megabytes(maxUploadBytes)} MB, la
            página le saca el audio antes de subirlo: puedes elegir el video del live tal cual. Se
            guarda en un bucket privado bajo tu usuario.
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
          {nameField("title-audio")}
          <ChatLogField
            disabled={pending}
            id="chat-log-audio"
            onChange={setChatLog}
            value={chatLog}
          />
          <button
            className="mt-3 min-h-11 rounded-card bg-primary px-5 font-semibold text-primary-fg disabled:opacity-60"
            disabled={pending}
            type="submit"
          >
            {conversion ? "Convirtiendo…" : pending ? "Subiendo…" : "Subir grabación"}
          </button>

          {conversion ? (
            // Sin barra, una conversion de varios minutos se lee como si la
            // pagina se hubiera colgado, y la asesora recarga y pierde todo.
            <div className="mt-3" role="status">
              <div className="h-2 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full bg-primary transition-[width] duration-200"
                  style={{ width: `${Math.round(conversion.ratio * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-fg-muted">
                Sacando el audio del archivo: {Math.round(conversion.ratio * 100)}%. Puede tardar
                unos minutos con un live largo. No cierres esta pestaña.
              </p>
            </div>
          ) : null}
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
