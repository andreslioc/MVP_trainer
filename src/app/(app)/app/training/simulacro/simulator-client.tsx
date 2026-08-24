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
import { MicMeter } from "./mic-meter.tsx";
import { SimulationResults, type ResultRow } from "./simulation-results.tsx";
import { DEFAULT_SPEED, SpeedChoice } from "./speed-choice.tsx";
import { useLiveCapture } from "./use-live-capture.ts";

type Phase = "preparar" | "cuenta" | "corriendo" | "analizando" | "listo";

/**
 * Segundos de cuenta regresiva antes de arrancar.
 *
 * No es cortesia: sin ellos el chat empieza a correr mientras la asesora
 * todavia esta buscando donde mirar, y las primeras preguntas se pierden por
 * eso y no por falta de atencion. Ademas es el hueco donde la grabacion y el
 * reloj del chat se sincronizan: la camara ya esta encendida y ambos arrancan
 * juntos al llegar a cero.
 */
const CUENTA_REGRESIVA_S = 5;

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
  const [transcript, setTranscript] = useState<string | null>(null);
  const [cuenta, setCuenta] = useState(CUENTA_REGRESIVA_S);
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
    setTranscript(result.data?.transcript ?? null);
    setPhase("listo");
  }, [capture, simulationId]);

  useEffect(() => {
    if (phase !== "cuenta") return;
    if (cuenta <= 0) {
      // La grabacion y el reloj del chat arrancan en la MISMA linea: es lo que
      // permite exigir que ninguna respuesta preceda a su pregunta.
      capture.record();
      startedAt.current = performance.now();
      setPhase("corriendo");
      return;
    }
    const timer = setTimeout(() => setCuenta((valor) => valor - 1), 1_000);
    return () => clearTimeout(timer);
  }, [phase, cuenta, capture]);

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
    // Se abre la camara ANTES de la cuenta: la asesora se acomoda viendose, y
    // si el permiso falla se entera ahora y no despues de esperar cinco
    // segundos en blanco.
    const abierta = await capture.open();
    if (!abierta) return;
    setSimulationId(started.data.id);
    setLines(started.data.timeline);
    setResults(null);
    setTranscript(null);
    setElapsedMs(0);
    setCuenta(CUENTA_REGRESIVA_S);
    setPhase("cuenta");
  }

  if (phase === "listo" && results) {
    return (
      <SimulationResults
        onRestart={() => {
          setPhase("preparar");
          setResults(null);
          setTranscript(null);
        }}
        results={results}
        transcript={transcript}
      />
    );
  }

  if (phase === "cuenta") {
    return (
      <div className="mt-8 flex flex-col items-center gap-4">
        <p className="text-6xl font-semibold tabular-nums text-primary" role="timer">
          {cuenta}
        </p>
        <p className="text-fg-muted">Acomódate. El chat arranca en {cuenta}…</p>
        <LiveStage elapsedMs={0} lines={[]} stream={capture.stream} />
        <MicMeter stream={capture.stream} />
        <button
          className="min-h-11 rounded-card border border-border px-4 font-semibold text-fg-muted"
          onClick={() => {
            void capture.stop();
            setPhase("preparar");
          }}
          type="button"
        >
          Cancelar
        </button>
      </div>
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
        <MicMeter stream={capture.stream} />
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
