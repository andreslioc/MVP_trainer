import { z } from "zod";

import { ADVISOR_ROLES } from "../roles.ts";

// Una sola lista de rangos en todo el repo: la de `lib/roles.ts`.
export const advisorRoles = ADVISOR_ROLES;
export const advisorStatuses = ["activa", "inactiva"] as const;

export type AdvisorRoleValue = (typeof advisorRoles)[number];
export type AdvisorStatusValue = (typeof advisorStatuses)[number];

export function isAdvisorRole(value: string): value is AdvisorRoleValue {
  return advisorRoles.includes(value as AdvisorRoleValue);
}

export function isAdvisorStatus(value: string): value is AdvisorStatusValue {
  return advisorStatuses.includes(value as AdvisorStatusValue);
}

export const advisorRoleUpdateSchema = z
  .object({
    advisorId: z.uuid("La cuenta no es válida."),
    role: z.enum(advisorRoles),
  })
  .strict();

/**
 * Borrar una cuenta pide escribir el correo completo.
 *
 * No es friccion decorativa: el borrado arrastra en cascada las practicas, los
 * lives, las grabaciones y los simulacros de esa persona, y eso no se puede
 * deshacer. Un boton con un "¿segura?" se aprieta sin leer; transcribir el
 * correo obliga a mirar A QUIEN se esta borrando, que es el error que de verdad
 * ocurre —borrar la fila de al lado—.
 */
export const advisorDeleteSchema = z
  .object({
    advisorId: z.uuid("La cuenta no es válida."),
    confirmEmail: z.string().trim().min(1, "Escribe el correo de la cuenta para confirmar."),
  })
  .strict();

export const advisorStatusUpdateSchema = z
  .object({
    advisorId: z.uuid("La cuenta no es válida."),
    status: z.enum(advisorStatuses),
  })
  .strict();

export const advisorInviteSchema = z
  .object({
    email: z.email("El correo no es válido."),
    displayName: z.string().trim().min(1, "El nombre es obligatorio."),
    role: z.enum(advisorRoles).default("asesor"),
  })
  .strict();

export type AdvisorRoleUpdate = z.input<typeof advisorRoleUpdateSchema>;
export type AdvisorStatusUpdate = z.input<typeof advisorStatusUpdateSchema>;
export type AdvisorDelete = z.input<typeof advisorDeleteSchema>;
export type AdvisorInvite = z.input<typeof advisorInviteSchema>;

/**
 * Una admin no se cambia el rol ni el estado a si misma. No es cortesia: es el
 * unico camino por el que la organizacion se queda sin nadie que pueda entrar a
 * Settings, y ese candado no se abre desde la app.
 */
export function selfLockoutError(
  actorId: string,
  targetId: string,
  field: "rol" | "estado" | "cuenta",
) {
  if (actorId !== targetId) return undefined;
  if (field === "cuenta") {
    return {
      code: "SELF_LOCKOUT" as const,
      message: "No puedes borrar tu propia cuenta. Pídeselo a otra administradora.",
      field,
    };
  }
  return {
    code: "SELF_LOCKOUT" as const,
    message: `No puedes cambiar tu propio ${field}. Pídeselo a otra administradora.`,
    field,
  };
}
