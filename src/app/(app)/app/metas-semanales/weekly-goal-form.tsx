"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";

import { saveWeeklyGoalsAction } from "./actions.ts";

type AdvisorOption = { id: string; displayName: string };
type FormValues = {
  weekStart: string;
  assignee: string;
  trainingSessionsTarget: number;
  pretrainingMinutesTarget: number;
  productsTarget: number;
};

export function WeeklyGoalForm({
  advisors,
  currentWeekStart,
  selectedWeek,
}: {
  advisors: AdvisorOption[];
  currentWeekStart: string;
  selectedWeek: string;
}) {
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      weekStart: selectedWeek < currentWeekStart ? currentWeekStart : selectedWeek,
      assignee: "all",
      trainingSessionsTarget: 3,
      pretrainingMinutesTarget: 60,
      productsTarget: 3,
    },
  });

  const submit = handleSubmit(async (values) => {
    setFeedback(undefined);
    const result = await saveWeeklyGoalsAction(values);
    if (!result.ok) {
      setFeedback({ type: "error", message: result.error.message });
      return;
    }
    setFeedback({
      type: "success",
      message: `Meta guardada para ${result.data.assigned} ${result.data.assigned === 1 ? "asesora" : "asesoras"}.`,
    });
  });

  return (
    <form className="mt-6 rounded-card border border-border bg-surface p-5" onSubmit={submit}>
      <h2 className="font-display text-xl font-medium text-fg">Definir una meta</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Los valores sugeridos se pueden cambiar. Al guardar de nuevo, se actualiza esa semana.
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-fg">
          Semana que comienza
          <input
            className="mt-1 min-h-11 w-full rounded-card border border-border-control bg-surface px-3"
            min={currentWeekStart}
            required
            type="date"
            {...register("weekStart")}
          />
          <span className="mt-1 block text-xs text-fg-muted">Debe ser un lunes.</span>
        </label>
        <label className="text-sm font-medium text-fg">
          Asignar a
          <select
            className="mt-1 min-h-11 w-full rounded-card border border-border-control bg-surface px-3"
            {...register("assignee")}
          >
            <option value="all">Todo el equipo de asesoras activas</option>
            {advisors.map((advisor) => (
              <option key={advisor.id} value={advisor.id}>
                {advisor.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <NumberField
          label="Sesiones de Training"
          name="trainingSessionsTarget"
          register={register}
        />
        <NumberField
          label="Minutos de Pre-training"
          name="pretrainingMinutesTarget"
          register={register}
        />
        <NumberField label="Fichas distintas" name="productsTarget" register={register} />
      </div>
      <button
        className="mt-5 min-h-11 rounded-card bg-primary px-4 font-semibold text-primary-fg hover:bg-primary-deep disabled:opacity-60"
        disabled={isSubmitting || advisors.length === 0}
        type="submit"
      >
        {isSubmitting ? "Guardando…" : "Guardar meta semanal"}
      </button>
      {feedback ? (
        <p
          className={`mt-4 rounded-card border p-3 text-sm ${
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

function NumberField({
  label,
  name,
  register,
}: {
  label: string;
  name: "trainingSessionsTarget" | "pretrainingMinutesTarget" | "productsTarget";
  register: ReturnType<typeof useForm<FormValues>>["register"];
}) {
  return (
    <label className="text-sm font-medium text-fg">
      {label}
      <input
        className="mt-1 min-h-11 w-full rounded-card border border-border-control bg-surface px-3 tabular-nums"
        min={0}
        required
        type="number"
        {...register(name, { valueAsNumber: true })}
      />
    </label>
  );
}
