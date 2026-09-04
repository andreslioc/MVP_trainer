"use client";

/**
 * Visor de la transcripcion y del chat de una grabacion.
 *
 * Usa el `<dialog>` nativo con `showModal()` en vez de un div flotante: la
 * trampa de foco, el cierre con Escape y el `aria-modal` vienen dados por el
 * navegador, y una version a mano de eso siempre termina dejando el foco suelto
 * detras del panel.
 *
 * El texto se pide al abrir, no al pintar la lista. La comparacion con las
 * preguntas del chat es el motivo de existir de esta pantalla, asi que el
 * filtro por linea es parte del visor y no un extra: sirve para responder
 * "¿esto lo contesto o no?" sin leer dos horas de live.
 */

import { useEffect, useRef, useState } from "react";

import { humanizeMark } from "../../../../lib/recordings.ts";
import { getRecordingTranscriptAction } from "./actions.ts";

type Loaded = {
  title: string | null;
  transcript: string | null;
  chatLog: string | null;
  durationS: number | null;
};

type Pestana = "transcripcion" | "chat";

export function TranscriptViewer({
  recordingId,
  label,
  hasChatLog,
}: {
  recordingId: string;
  label: string;
  hasChatLog: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Loaded | null>(null);
  const [pestana, setPestana] = useState<Pestana>("transcripcion");
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  async function abrir() {
    setOpen(true);
    if (data || loading) return;
    setLoading(true);
    setError(null);
    const result = await getRecordingTranscriptAction(recordingId);
    setLoading(false);
    if (result.ok) setData(result.data);
    else setError(result.error.message);
  }

  const texto = pestana === "transcripcion" ? (data?.transcript ?? "") : (data?.chatLog ?? "");
  // La marca se reescribe ANTES de filtrar: el buscador tiene que coincidir
  // con lo que se ve en pantalla, no con el formato crudo de la base.
  const lineas = texto
    .split("\n")
    .map((linea, indice) => ({ n: indice + 1, texto: humanizeMark(linea.trim()) }))
    .filter((linea) => linea.texto);
  const termino = filtro.trim().toLowerCase();
  const visibles = termino
    ? lineas.filter((linea) => linea.texto.toLowerCase().includes(termino))
    : lineas;

  return (
    <>
      <button
        aria-label={`Ver transcripción de ${label}`}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-card border border-border text-fg-muted hover:border-primary hover:text-primary"
        onClick={abrir}
        title="Ver transcripción"
        type="button"
      >
        <svg
          aria-hidden="true"
          fill="none"
          height="20"
          stroke="currentColor"
          strokeWidth="1.75"
          viewBox="0 0 24 24"
          width="20"
        >
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      <dialog
        aria-labelledby="visor-title"
        className="m-auto max-h-[85vh] w-[min(56rem,92vw)] rounded-card border border-border bg-surface p-0 text-fg backdrop:bg-scrim/70"
        onClose={() => setOpen(false)}
        ref={dialog}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-4">
          <div>
            <h2 className="text-lg font-semibold" id="visor-title">
              {data?.title ?? label}
            </h2>
            <p className="mt-1 text-sm text-fg-muted" role="status">
              {loading
                ? "Cargando…"
                : error
                  ? "No se pudo cargar."
                  : termino
                    ? `${visibles.length} de ${lineas.length} líneas coinciden`
                    : `${lineas.length} líneas`}
            </p>
          </div>
          <button
            className="min-h-11 min-w-11 rounded-card border border-border px-3 text-sm font-semibold"
            onClick={() => setOpen(false)}
            type="button"
          >
            Cerrar
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <fieldset className="flex gap-2 border-0 p-0">
            <legend className="sr-only">Qué se muestra</legend>
            <button
              aria-pressed={pestana === "transcripcion"}
              className={`min-h-11 rounded-card border px-3 text-sm font-semibold ${
                pestana === "transcripcion"
                  ? "border-primary bg-primary text-primary-fg"
                  : "border-border text-fg-muted"
              }`}
              onClick={() => setPestana("transcripcion")}
              type="button"
            >
              Transcripción
            </button>
            {hasChatLog ? (
              <button
                aria-pressed={pestana === "chat"}
                className={`min-h-11 rounded-card border px-3 text-sm font-semibold ${
                  pestana === "chat"
                    ? "border-primary bg-primary text-primary-fg"
                    : "border-border text-fg-muted"
                }`}
                onClick={() => setPestana("chat")}
                type="button"
              >
                Chat del live
              </button>
            ) : null}
          </fieldset>
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-fg-muted">Buscar</span>
            <input
              className="min-h-11 w-48 rounded-card border border-control bg-surface px-3 text-fg"
              onChange={(event) => setFiltro(event.target.value)}
              placeholder="creatina, envío…"
              type="search"
              value={filtro}
            />
          </label>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-4">
          {loading ? (
            <p className="text-fg-muted">Cargando el texto…</p>
          ) : error ? (
            <p className="font-semibold text-confidence-low-fg" role="alert">
              {error}
            </p>
          ) : lineas.length === 0 ? (
            <p className="text-fg-muted">
              {pestana === "chat"
                ? "Esta grabación no tiene chat guardado."
                : "Esta grabación todavía no tiene transcripción."}
            </p>
          ) : visibles.length === 0 ? (
            <p className="text-fg-muted">Ninguna línea contiene «{filtro.trim()}».</p>
          ) : (
            <ol className="space-y-1 text-sm tabular-nums">
              {visibles.map((linea) => (
                <li className="border-b border-border pb-1 last:border-0" key={linea.n}>
                  {linea.texto}
                </li>
              ))}
            </ol>
          )}
        </div>
      </dialog>
    </>
  );
}
