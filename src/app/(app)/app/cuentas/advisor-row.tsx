"use client";

import { useState, useTransition } from "react";

import {
  type AdvisorRoleValue,
  type AdvisorStatusValue,
  advisorRoles,
} from "../../../../lib/validation/advisor.ts";
import { ROLE_LABELS } from "../../../../lib/roles.ts";
import { updateAdvisorRoleAction, updateAdvisorStatusAction } from "./actions.ts";
import { DeleteAccountDialog } from "./delete-account-dialog.tsx";

export type AdvisorRowData = {
  id: string;
  email: string;
  displayName: string;
  role: AdvisorRoleValue;
  status: AdvisorStatusValue;
  isSelf: boolean;
};

export function AdvisorRow({ advisor }: { advisor: AdvisorRowData }) {
  const [role, setRole] = useState(advisor.role);
  const [status, setStatus] = useState(advisor.status);
  const [error, setError] = useState<string>();
  const [borrada, setBorrada] = useState(false);
  const [pending, startTransition] = useTransition();
  const roleFieldId = `role-${advisor.id}`;

  function changeRole(next: AdvisorRoleValue) {
    const previous = role;
    setRole(next);
    setError(undefined);
    startTransition(async () => {
      const result = await updateAdvisorRoleAction({ advisorId: advisor.id, role: next });
      if (!result.ok) {
        setRole(previous);
        setError(result.error.message);
      }
    });
  }

  function toggleStatus() {
    const next: AdvisorStatusValue = status === "activa" ? "inactiva" : "activa";
    const previous = status;
    setStatus(next);
    setError(undefined);
    startTransition(async () => {
      const result = await updateAdvisorStatusAction({ advisorId: advisor.id, status: next });
      if (!result.ok) {
        setStatus(previous);
        setError(result.error.message);
      }
    });
  }

  // La fila desaparece en cuanto el borrado responde, sin esperar a que la
  // pagina se recargue: dejar visible una cuenta que ya no existe invita a
  // apretarle otro boton.
  if (borrada) return null;

  return (
    <tr className="border-t border-border align-top">
      <td className="px-3 py-3">
        <p className="font-semibold text-fg">
          {advisor.displayName}
          {advisor.isSelf ? (
            <span className="ml-2 rounded-full border border-primary-tint-border bg-primary-tint px-2 py-0.5 text-xs font-semibold text-primary-deep">
              Tú
            </span>
          ) : null}
        </p>
        <p className="text-sm text-fg-muted">{advisor.email}</p>
        {error ? (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </td>

      <td className="px-3 py-3">
        <label className="sr-only" htmlFor={roleFieldId}>
          Rol de {advisor.displayName}
        </label>
        <select
          className="min-h-11 w-full rounded-card border border-border-control bg-surface px-3 text-sm text-fg disabled:opacity-60"
          disabled={advisor.isSelf || pending}
          id={roleFieldId}
          onChange={(event) => changeRole(event.target.value as AdvisorRoleValue)}
          value={role}
        >
          {/*
            Las opciones salen de la lista de rangos y no escritas a mano: la
            version anterior tenia solo asesor y admin, asi que cuando entro el
            rango de supervisora quedo imposible de asignar desde la pantalla.
          */}
          {advisorRoles.map((valor) => (
            <option key={valor} value={valor}>
              {ROLE_LABELS[valor]}
            </option>
          ))}
        </select>
      </td>

      <td className="px-3 py-3">
        <span
          className={`inline-block rounded-full border px-2 py-1 text-xs font-semibold ${
            status === "activa"
              ? "border-success bg-confidence-high-bg text-confidence-high-fg"
              : "border-warning-border bg-confidence-mid-bg text-confidence-mid-fg"
          }`}
        >
          {status === "activa" ? "Activa" : "Inactiva"}
        </span>
      </td>

      <td className="px-3 py-3">
        <div className="flex flex-wrap justify-end gap-2">
          <button
            className="min-h-11 rounded-card border border-border-control px-3 text-sm font-semibold text-fg hover:bg-background disabled:opacity-60"
            disabled={advisor.isSelf || pending}
            onClick={toggleStatus}
            type="button"
          >
            {status === "activa" ? "Desactivar" : "Reactivar"}
          </button>
          <DeleteAccountDialog
            advisorId={advisor.id}
            disabled={advisor.isSelf || pending}
            displayName={advisor.displayName}
            email={advisor.email}
            onDeleted={() => setBorrada(true)}
          />
        </div>
      </td>
    </tr>
  );
}
