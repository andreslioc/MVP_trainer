"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";

import type { CommercialRuleKey } from "../../../../lib/validation/commercial-rule.ts";
import { updateCommercialRuleAction } from "./actions.ts";

const presentation = {
  originalidad: {
    title: "Originalidad",
    description: "Mensaje verificable sobre procedencia, sin inventar certificaciones.",
    fieldLabel: "Mensaje",
    valueKey: "message",
  },
  envio_gratis: {
    title: "Envío gratuito",
    description: "Valor mínimo de compra expresado en pesos colombianos.",
    fieldLabel: "Umbral en COP",
    valueKey: "threshold_cop",
    numeric: true,
  },
  promo_live: {
    title: "Promoción del live",
    description: "Solo entra al Copilot cuando esta regla está activa.",
    fieldLabel: "Mensaje promocional",
    valueKey: "message",
  },
  seguir_tiktok: {
    title: "Seguir en TikTok",
    description: "Llamado a la acción para mantener contacto con la audiencia.",
    fieldLabel: "CTA",
    valueKey: "cta",
  },
  canal_whatsapp: {
    title: "Canal de WhatsApp",
    description: "Llamado a la acción para consultas fuera del live.",
    fieldLabel: "CTA",
    valueKey: "cta",
  },
  cupon_por_seguir: {
    title: "Cupón por seguir",
    description: "Mensaje del cupón; mantenlo inactivo cuando no esté vigente.",
    fieldLabel: "Mensaje del cupón",
    valueKey: "message",
  },
  margen_precio: {
    title: "Margen del precio en el live",
    description:
      "Cuánto puede moverse el precio en una transmisión sin que contar otra cifra sea un error. El simulacro acepta como correcto cualquier precio dentro de este margen, y el envío gratuito solo se promete si el producto alcanza el umbral incluso en su precio más bajo. En cero, solo el precio de la ficha es válido.",
    fieldLabel: "Margen en COP",
    valueKey: "margin_cop",
    numeric: true,
  },
} as const satisfies Record<
  CommercialRuleKey,
  {
    title: string;
    description: string;
    fieldLabel: string;
    valueKey: string;
    /** El campo se edita como numero y se guarda como numero, no como texto. */
    numeric?: boolean;
  }
>;

type RuleFormValues = { content: string; active: boolean };

export function RuleEditor({
  rule,
}: {
  rule: { key: CommercialRuleKey; value: Record<string, unknown>; active: boolean };
}) {
  const copy = presentation[rule.key];
  const initialValue = rule.value[copy.valueKey];
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RuleFormValues>({
    defaultValues: { content: String(initialValue ?? ""), active: rule.active },
  });
  const active = watch("active");
  const esNumerico = "numeric" in copy && copy.numeric === true;

  const submit = handleSubmit(async (values) => {
    setFeedback(undefined);
    const numeric = "numeric" in copy && copy.numeric === true;
    const value = { [copy.valueKey]: numeric ? Number(values.content) : values.content };
    const result = await updateCommercialRuleAction({
      key: rule.key,
      value,
      active: values.active,
    });
    setFeedback(
      result.ok
        ? { type: "success", message: "Regla guardada. La siguiente lectura usará este valor." }
        : { type: "error", message: result.error.message },
    );
  });

  return (
    <form className="rounded-card border border-border bg-surface p-4" onSubmit={submit}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-fg">{copy.title}</h2>
          <p className="mt-1 max-w-xl text-sm text-fg-muted">{copy.description}</p>
        </div>
        <span
          className={`rounded-full border px-2 py-1 text-xs font-semibold ${
            active
              ? "border-success bg-confidence-high-bg text-confidence-high-fg"
              : "border-warning-border bg-confidence-mid-bg text-confidence-mid-fg"
          }`}
        >
          {active ? "Activa" : "Inactiva"}
        </span>
      </div>

      <label className="mt-4 block text-sm font-medium text-fg">
        {copy.fieldLabel}
        <input
          className="mt-1 w-full rounded-card border bg-surface px-3 py-2"
          inputMode={esNumerico ? "numeric" : "text"}
          type={esNumerico ? "number" : "text"}
          {...register("content", { required: "Este campo es obligatorio." })}
        />
        {errors.content ? (
          <span className="mt-1 block text-sm text-destructive">{errors.content.message}</span>
        ) : null}
      </label>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-fg">
          <input className="size-5 rounded border" type="checkbox" {...register("active")} />
          Disponible para composición
        </label>
        <button
          className="min-h-11 rounded-card bg-primary px-4 font-semibold text-primary-fg hover:bg-primary-deep disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Guardando…" : "Guardar regla"}
        </button>
      </div>

      {feedback ? (
        <p
          className={`mt-3 rounded-card border p-3 text-sm ${
            feedback.type === "success"
              ? "border-success bg-confidence-high-bg text-confidence-high-fg"
              : "border-destructive bg-confidence-low-bg text-confidence-low-fg"
          }`}
          role={feedback.type === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}
    </form>
  );
}
