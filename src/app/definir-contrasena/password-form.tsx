"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { PASSWORD_MIN_LENGTH, type PasswordInput } from "../../lib/validation/password.ts";
import { setPasswordAction } from "./actions.ts";

export function PasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<PasswordInput>({ defaultValues: { password: "", confirmation: "" } });

  const submit = handleSubmit(async (values) => {
    setError(undefined);
    const result = await setPasswordAction(values);

    if (result.ok) {
      // `refresh` antes de navegar: la cookie de sesion cambio al actualizar la
      // contrasena y el arbol de servidor en cache aun trae la anterior.
      router.refresh();
      router.push("/app");
      return;
    }

    if (result.error.field === "confirmation" || result.error.field === "password") {
      setFieldError(result.error.field, { message: result.error.message });
      return;
    }
    setError(result.error.message);
  });

  const enviando = isSubmitting || isSubmitSuccessful;

  return (
    <form className="mt-6 space-y-4" onSubmit={submit}>
      <label className="block text-sm font-medium text-fg">
        Contraseña nueva
        <input
          aria-describedby="pista-contrasena"
          aria-invalid={errors.password ? true : undefined}
          autoComplete="new-password"
          className="mt-1 min-h-11 w-full rounded-card border border-border-control bg-surface px-3 text-fg"
          type="password"
          {...register("password", { required: "Escribe una contraseña." })}
        />
        {errors.password ? (
          <span className="mt-1 block text-sm text-destructive" role="alert">
            {errors.password.message}
          </span>
        ) : null}
      </label>

      <p className="text-sm text-fg-muted" id="pista-contrasena">
        Al menos {PASSWORD_MIN_LENGTH} caracteres.
      </p>

      <label className="block text-sm font-medium text-fg">
        Repite la contraseña
        <input
          aria-invalid={errors.confirmation ? true : undefined}
          autoComplete="new-password"
          className="mt-1 min-h-11 w-full rounded-card border border-border-control bg-surface px-3 text-fg"
          type="password"
          {...register("confirmation", { required: "Repite la contraseña." })}
        />
        {errors.confirmation ? (
          <span className="mt-1 block text-sm text-destructive" role="alert">
            {errors.confirmation.message}
          </span>
        ) : null}
      </label>

      <button
        className="min-h-11 w-full rounded-card bg-primary px-4 font-semibold text-primary-fg hover:bg-primary-deep disabled:opacity-60"
        disabled={enviando}
        type="submit"
      >
        {enviando ? "Guardando…" : "Guardar y entrar"}
      </button>

      {error ? (
        <p
          className="rounded-card border border-destructive bg-confidence-low-bg p-3 text-sm text-confidence-low-fg"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
