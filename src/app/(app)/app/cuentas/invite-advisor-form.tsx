"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";

import { ROLE_LABELS } from "../../../../lib/roles.ts";
import { type AdvisorRoleValue, advisorRoles } from "../../../../lib/validation/advisor.ts";
import { inviteAdvisorAction } from "./actions.ts";

type InviteFormValues = {
  displayName: string;
  email: string;
  role: AdvisorRoleValue;
};

export function InviteAdvisorForm() {
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteFormValues>({
    defaultValues: { displayName: "", email: "", role: "asesor" },
  });

  const submit = handleSubmit(async (values) => {
    setFeedback(undefined);
    const result = await inviteAdvisorAction(values);
    if (result.ok) {
      reset();
      setFeedback({
        type: "success",
        message: "Invitación enviada. La cuenta aparece aquí en cuanto acepte el correo.",
      });
      return;
    }
    setFeedback({ type: "error", message: result.error.message });
  });

  return (
    <form className="mt-4 rounded-card border border-border bg-surface p-4" onSubmit={submit}>
      <h3 className="text-lg font-semibold text-fg">Invitar una cuenta</h3>
      <p className="mt-1 text-sm text-fg-muted">
        El acceso es solo por invitación. Llega un correo con el enlace para crear la contraseña.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="block text-sm font-medium text-fg">
          Nombre
          <input
            className="mt-1 min-h-11 w-full rounded-card border border-border-control bg-surface px-3"
            {...register("displayName", { required: "El nombre es obligatorio." })}
          />
          {errors.displayName ? (
            <span className="mt-1 block text-sm text-destructive">
              {errors.displayName.message}
            </span>
          ) : null}
        </label>

        <label className="block text-sm font-medium text-fg">
          Correo
          <input
            autoComplete="email"
            className="mt-1 min-h-11 w-full rounded-card border border-border-control bg-surface px-3"
            type="email"
            {...register("email", { required: "El correo es obligatorio." })}
          />
          {errors.email ? (
            <span className="mt-1 block text-sm text-destructive">{errors.email.message}</span>
          ) : null}
        </label>

        <label className="block text-sm font-medium text-fg">
          Rol
          <select
            className="mt-1 min-h-11 w-full rounded-card border border-border-control bg-surface px-3"
            {...register("role")}
          >
            {advisorRoles.map((valor) => (
              <option key={valor} value={valor}>
                {ROLE_LABELS[valor]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        className="mt-4 min-h-11 rounded-card bg-primary px-4 font-semibold text-primary-fg hover:bg-primary-deep disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Enviando…" : "Enviar invitación"}
      </button>

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
