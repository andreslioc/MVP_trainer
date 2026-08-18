"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";

import {
  AnswerPanel,
  type CopilotCompositionView,
  type CopilotVariant,
} from "../../../../components/copilot/answer-panel.tsx";
import { COPILOT_VIEW_DEFAULTS } from "../../../../lib/copilot/view-defaults.ts";
import { endLiveSessionAction, startLiveSessionAction } from "./actions.ts";

type CopilotFormValues = {
  productId: string;
  customerQuestion: string;
  objective: string;
  lengthVariant: CopilotVariant;
  tone: string;
};

type CompleteData = {
  composition: CopilotCompositionView;
  durations: Record<CopilotVariant, number>;
};

type StreamEvent =
  | { type: "chunk"; chunk: string }
  | { type: "complete"; result: { ok: true; data: CompleteData } }
  | { type: "error"; result: { ok: false; error: { message: string } } };

export function CopilotForm({
  products,
  activeRules,
  initialSessionId,
}: {
  products: Array<{ id: string; name: string; brand: string }>;
  activeRules: Array<{ key: string }>;
  initialSessionId: string | null;
}) {
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [streamedText, setStreamedText] = useState("");
  const [complete, setComplete] = useState<CompleteData>();
  const [error, setError] = useState<string>();
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const { register, handleSubmit, watch, formState } = useForm<CopilotFormValues>({
    defaultValues: {
      productId: "",
      customerQuestion: "",
      objective: "informar con claridad",
      lengthVariant: COPILOT_VIEW_DEFAULTS.variant,
      tone: "cercano",
    },
  });
  const variant = watch("lengthVariant");
  const hasActivePromotion = activeRules.some((rule) => rule.key === "promo_live");

  async function ensureSession() {
    if (sessionId) return sessionId;
    const result = await startLiveSessionAction();
    if (!result.ok) throw new Error(result.error.message);
    setSessionId(result.data.id);
    return result.data.id;
  }

  async function readStream(response: Response) {
    if (!response.ok || !response.body) throw new Error("No se pudo abrir la respuesta en vivo.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line) continue;
        const streamEvent = JSON.parse(line) as StreamEvent;
        if (streamEvent.type === "chunk") {
          setStreamedText((current) => current + streamEvent.chunk);
        } else if (streamEvent.type === "complete" && streamEvent.result.ok) {
          setComplete(streamEvent.result.data);
        } else if (streamEvent.type === "error") {
          throw new Error(streamEvent.result.error.message);
        }
      }
      if (done) break;
    }
  }

  const submit = handleSubmit(async (values) => {
    setError(undefined);
    setComplete(undefined);
    setStreamedText("");
    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const liveSessionId = await ensureSession();
      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, liveSessionId }),
        signal: controller.signal,
      });
      await readStream(response);
    } catch (caught) {
      setError(
        caught instanceof DOMException && caught.name === "AbortError"
          ? "Generación cancelada. Puedes intentarlo otra vez."
          : caught instanceof Error
            ? caught.message
            : "No se pudo generar. Intenta de nuevo.",
      );
    } finally {
      setIsStreaming(false);
      abortRef.current = undefined;
    }
  });

  async function endSession() {
    if (!sessionId) return;
    const result = await endLiveSessionAction(sessionId);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setSessionId(null);
    setComplete(undefined);
    setStreamedText("");
  }

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)]">
      <form className="rounded-card border border-border bg-surface p-5" onSubmit={submit}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-fg">Pregunta de la clienta</h2>
            <p className="mt-1 text-sm text-fg-muted">
              {sessionId ? "Live en curso" : "El live inicia al generar la primera respuesta"}
            </p>
          </div>
          {sessionId ? (
            <button
              className="min-h-11 rounded-card border border-border-control px-3 text-sm font-semibold text-fg"
              disabled={isStreaming}
              onClick={endSession}
              type="button"
            >
              Finalizar live
            </button>
          ) : null}
        </div>

        <label className="mt-5 block text-sm font-semibold text-fg" htmlFor="copilot-product">
          Producto verificado
        </label>
        <select
          className="mt-1 min-h-11 w-full rounded-card border bg-surface px-3"
          id="copilot-product"
          required
          {...register("productId")}
        >
          <option value="">Selecciona una ficha</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} · {product.brand}
            </option>
          ))}
        </select>

        <label className="mt-4 block text-sm font-semibold text-fg" htmlFor="customer-question">
          Pregunta
        </label>
        <textarea
          className="mt-1 min-h-32 w-full rounded-card border bg-surface p-3"
          id="customer-question"
          maxLength={2_000}
          required
          {...register("customerQuestion")}
        />

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-fg">
            Objetivo
            <select
              className="mt-1 min-h-11 w-full rounded-card border bg-surface px-3"
              {...register("objective")}
            >
              <option value="informar con claridad">Informar</option>
              <option value="resolver una objecion">Resolver objeción</option>
              <option value="guiar la compra">Guiar la compra</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-fg">
            Tono
            <select
              className="mt-1 min-h-11 w-full rounded-card border bg-surface px-3"
              {...register("tone")}
            >
              <option value="cercano">Cercano</option>
              <option value="directo">Directo</option>
              <option value="educativo">Educativo</option>
            </select>
          </label>
        </div>

        <fieldset className="mt-4">
          <legend className="text-sm font-semibold text-fg">Duración</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(
              [
                ["express", "Express", COPILOT_VIEW_DEFAULTS.durationLabels.express],
                ["estandar", "Estándar", COPILOT_VIEW_DEFAULTS.durationLabels.estandar],
                ["profunda", "Profunda", COPILOT_VIEW_DEFAULTS.durationLabels.profunda],
              ] as const
            ).map(([value, label, duration]) => (
              <label
                className="rounded-card border border-border-control p-2 text-center text-sm"
                key={value}
              >
                <input className="mr-1" type="radio" value={value} {...register("lengthVariant")} />
                <span className="font-semibold">{label}</span>
                <span className="block text-xs text-fg-muted">{duration}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <p className="mt-4 text-xs text-fg-muted">
          {activeRules.length} reglas comerciales activas disponibles en esta respuesta.
        </p>
        <p
          className={`mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${
            hasActivePromotion
              ? "border-success bg-confidence-high-bg text-confidence-high-fg"
              : "border-warning-border bg-confidence-mid-bg text-confidence-mid-fg"
          }`}
        >
          Promoción del live: {hasActivePromotion ? "activa" : "inactiva"}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="min-h-11 rounded-card bg-primary px-5 font-semibold text-primary-fg hover:bg-primary-deep disabled:opacity-60"
            disabled={isStreaming || formState.isSubmitting}
            type="submit"
          >
            {isStreaming ? "Generando…" : complete ? "Regenerar" : "Generar respuesta"}
          </button>
          {isStreaming ? (
            <button
              className="min-h-11 rounded-card border border-border-control px-4 font-semibold text-fg"
              onClick={() => abortRef.current?.abort()}
              type="button"
            >
              Cancelar
            </button>
          ) : null}
        </div>
      </form>

      <AnswerPanel
        composition={complete?.composition}
        durations={complete?.durations}
        error={error}
        isStreaming={isStreaming}
        streamedText={streamedText}
        variant={variant}
      />
    </div>
  );
}
