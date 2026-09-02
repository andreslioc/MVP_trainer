"use client";

import { useId, useRef, useState, useTransition } from "react";

import { deleteAdvisorAction } from "./actions.ts";

/**
 * Borrar una cuenta, con el aviso de que se lleva y confirmacion escrita.
 *
 * Pide transcribir el correo y no un "¿segura?". Un boton de confirmar se
 * aprieta sin leer, y el error que de verdad ocurre no es querer borrar y
 * dudar: es borrar la fila de al lado. Escribir el correo obliga a mirar A
 * QUIEN se esta borrando.
 *
 * Se usa el <dialog> nativo: trae el foco atrapado, el cierre con Escape y el
 * fondo inerte sin una linea de JavaScript propia.
 */
export function DeleteAccountDialog({
  advisorId,
  displayName,
  email,
  disabled,
  onDeleted,
}: {
  advisorId: string;
  displayName: string;
  email: string;
  disabled: boolean;
  onDeleted: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const fieldId = useId();
  const coincide = confirmacion.trim().toLowerCase() === email.toLowerCase();

  function abrir() {
    setConfirmacion("");
    setError(undefined);
    dialog.current?.showModal();
  }

  function borrar() {
    setError(undefined);
    startTransition(async () => {
      const result = await deleteAdvisorAction({ advisorId, confirmEmail: confirmacion });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      dialog.current?.close();
      onDeleted();
    });
  }

  return (
    <>
      <button
        className="min-h-11 rounded-card border border-destructive px-3 text-sm font-semibold text-destructive hover:bg-confidence-low-bg disabled:opacity-60"
        disabled={disabled}
        onClick={abrir}
        type="button"
      >
        Borrar
      </button>

      <dialog
        // `m-auto` a mano: el navegador centra un <dialog> modal con
        // `margin: auto`, y el reset de Tailwind lo pone en 0, asi que sin esto
        // el aviso sale pegado a la esquina de arriba a la izquierda.
        className="m-auto max-w-lg rounded-card border border-border bg-surface p-6 text-left backdrop:bg-fg/40"
        ref={dialog}
      >
        <h2 className="text-xl font-semibold text-fg">Borrar la cuenta de {displayName}</h2>
        <p className="mt-3 text-fg">Esto no se puede deshacer. Con la cuenta se van también:</p>
        <ul className="mt-2 grid gap-1 text-sm text-fg-muted">
          <li>· sus prácticas y todas sus respuestas evaluadas</li>
          <li>· sus lives, con las respuestas del Copilot de cada uno</li>
          <li>· sus grabaciones y lo que se analizó de ellas</li>
          <li>· sus simulacros</li>
        </ul>
        <p className="mt-3 text-sm text-fg-muted">
          El registro de costos de la organización se queda, sin su nombre. Si lo que quieres es
          quitarle el acceso sin perder su historial, usa Desactivar.
        </p>

        <label className="mt-5 block text-sm font-semibold text-fg" htmlFor={fieldId}>
          Escribe {email} para confirmar
        </label>
        <input
          autoComplete="off"
          className="mt-2 min-h-11 w-full rounded-card border border-border-control bg-surface px-3 text-sm text-fg"
          id={fieldId}
          onChange={(event) => setConfirmacion(event.target.value)}
          type="email"
          value={confirmacion}
        />
        {error ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            className="min-h-11 rounded-card border border-border-control px-4 text-sm font-semibold text-fg hover:bg-background"
            onClick={() => dialog.current?.close()}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="min-h-11 rounded-card bg-destructive px-4 text-sm font-semibold text-primary-fg disabled:opacity-60"
            disabled={!coincide || pending}
            onClick={borrar}
            type="button"
          >
            {pending ? "Borrando…" : "Borrar la cuenta"}
          </button>
        </div>
      </dialog>
    </>
  );
}
