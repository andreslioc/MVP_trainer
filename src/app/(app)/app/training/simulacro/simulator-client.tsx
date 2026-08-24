"use client";

/**
 * El simulacro completo: preparar, correr y ver el resultado.
 *
 * El cronometro avanza con `requestAnimationFrame` y no con `setInterval`
 * porque el chat se pinta contra el mismo reloj: con dos relojes distintos, una
 * pregunta puede aparecer en pantalla un instante despues del segundo que quedo
 * guardado en el guion, y la reaccion medida saldria corrida.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { SimLine, SimSpeed } from "../../../../../lib/simulator/chat-player.ts";
import { finishSimulationAction, startSimulationAction } from "./actions.ts";
import { LiveStage } from "./live-stage.tsx";
import { SimulationResults, type ResultRow } from "./simulation-results.tsx";
import { DEFAULT_SPEED, SpeedChoice } from "./speed-choice.tsx";
import { useLiveCapture } from "./use-live-capture.ts";

type Phase = "preparar" | "corriendo" | "analizando" | "listo";

const DURATIONS = [
  { value: 60, label: "1 minuto" },
  { value: 180, label: "3 minutos" },
  { value: 300, label: "5 minutos" },
] as const;

function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function SimulatorClient() {
  const [phase, setPhase] = useState<Phase>("preparar");
  const [speed, setSpeed] = useState<SimSpeed>(DEFAULT_SPEED);
  const [durationS, setDurationS] = useState<number>(180);
  const [questionCount, setQuestionCount] = useState(4);
  const [lines, setLines] = useState<readonly SimLine[]>([]);
  const [simulationId, setSimulationId] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const capture = useLiveCapture();
  const startedAt = useRef(0);
  const frame = useRef(0);

  const finish = useCallback(async () => {
    cancelAnimationFrame(frame.current);
    setPhase("analizando");
    const blob = await capture.stop();
    if (!blob || !simulationId) {
      setMessage("No se capturó audio del simulacro.");
      setPhase("preparar");
      return;
    }
    const data = new FormData();
    data.set("simulationId", simulationId);
    data.set("audio", new File([blob], "simulacro", { type: blob.type }));
    const result = await finishSimulationAction(data);
    if (!result.ok) {
      setMessage(result.error.message);
      setPhase("preparar");
      return;
    }
    setResults(result.data?.results ?? []);
    setPhase("listo");
  }, [capture, simulationId]);

  useEffect(() => {
    if (phase !== "corriendo") return;
    function tick() {
      const elapsed = performance.now() - startedAt.current;
      setElapsedMs(elapsed);
      if (elapsed >= durationS * 1_000) {
        void finish();
        return;
      }
      frame.current = requestAnimationFrame(tick);
    }
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [phase, durationS, finish]);

  async function begin() {
    setMessage(null);
    const started = await startSimulationAction({ speed, durationS, questionCount });
    if (!started.ok) {
      setMessage(started.error.message);
      return;
    }
    const listening = await capture.start();
    if (!listening) return;
    setSimulationId(started.data.id);
    setLines(started.data.timeline);
    setResults(null);
    startedAt.current = performance.now();
    setElapsedMs(0);
    setPhase("corriendo");
  }

  if (phase === "listo" && results) {
    return (
      <SimulationResults
        onRestart={() => {
          setPhase("preparar");
          setResults(null);
        }}
        results={results}
      />
    );
  }

  if (phase === "corriendo" || phase === "analizando") {
    const restante = durationS * 1_000 - elapsedMs;
    return (
      <div className="mt-8 flex flex-col items-center gap-4">
        <p className="text-2xl font-semibold tabular-nums text-fg" role="timer">
          {phase === "analizando" ? "Analizando…" : clock(restante)}
        </p>
        <LiveStage elapsedMs={elapsedMs} lines={lines} stream={capture.stream} />
        {phase === "corriendo" ? (
          <button
            className="min-h-11 rounded-card border border-primary px-4 font-semibold text-primary"
            onClick={() => void finish()}
            type="button"
          >
            Terminar ahora
          </button>
        ) : (
          <p className="text-sm text-fg-muted">
            Transcribiendo lo que dijiste y revisando qué preguntas alcanzaste a responder.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-8 max-w-xl rounded-card border border-border bg-surface p-5">
      <h2 className="text-xl font-semibold text-fg">Simulacro de live</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Te ves en cámara y el chat corre solo. Contesta en voz alta las preguntas que aparezcan
        entre los comentarios. No se graba video: solo tu voz.
      </p>

      <div className="mt-5 space-y-5">
        <SpeedChoice disabled={false} onChange={setSpeed} value={speed} />

        <fieldset>
          <legend className="text-sm font-semibold text-fg">Duración</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {DURATIONS.map((option) => (
              <label
                className={`min-h-11 rounded-card border p-2 text-center text-sm ${
                  durationS === option.value
                    ? "border-primary bg-confidence-high-bg"
                    : "border-border"
                }`}
                key={option.value}
              >
                <input
                  checked={durationS === option.value}
                  className="mr-1"
                  name="duracion"
                  onChange={() => setDurationS(option.value)}
                  type="radio"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block text-sm font-semibold text-fg">
          Preguntas que aparecerán
          <input
            className="mt-1 min-h-11 w-24 rounded-card border border-control bg-surface px-3 tabular-nums"
            max={10}
            min={1}
            onChange={(event) => setQuestionCount(Number(event.target.value) || 1)}
            type="number"
            value={questionCount}
          />
        </label>
      </div>

      {capture.error ? (
        <p className="mt-4 text-sm font-semibold text-destructive" role="alert">
          {capture.error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-4 text-sm font-semibold text-destructive" role="alert">
          {message}
        </p>
      ) : null}

      <button
        className="mt-5 min-h-11 rounded-card bg-primary px-5 font-semibold text-primary-fg hover:bg-primary-deep"
        onClick={() => void begin()}
        type="button"
      >
        Empezar simulacro
      </button>
    </div>
  );
}
