import { eq } from "drizzle-orm";
import { z } from "zod";

import { advisors } from "../db/schema.ts";
import { createAdminSupabaseClient } from "../lib/auth.ts";
import {
  type AdvisorDelete,
  advisorDeleteSchema,
  selfLockoutError,
} from "../lib/validation/advisor.ts";
import { type AdvisorDatabase, type AdvisorDependencies, advisorDependencies } from "./advisors.ts";

/**
 * Lo unico que este modulo necesita del sistema de acceso: borrar un usuario y
 * decir si fallo. Declararlo asi —y no como el cliente completo— es lo que
 * permite probarlo con un doble de dos lineas en vez de fabricar las treinta
 * propiedades de la API de administracion.
 */
type BorrarUsuario = (id: string) => Promise<{ error: { message: string } | null }>;

/**
 * Borra una cuenta: primero en la aplicacion, despues en el sistema de acceso.
 *
 * En ese orden a proposito. Si se borrara primero el acceso y fallara la fila,
 * quedaria una cuenta en la aplicacion sin forma de entrar —invisible para su
 * dueña y activa para el resto del sistema—. Al revés, si falla el segundo
 * paso, queda un usuario de acceso sin cuenta: no puede entrar a ningun modulo,
 * porque cada uno resuelve la sesion contra `advisors`, y se puede volver a
 * invitar con el mismo correo.
 *
 * QUE SE LLEVA: la base borra en cascada sus practicas, sus respuestas, sus
 * lives, sus grabaciones y sus simulacros. Lo unico que sobrevive es el registro
 * de llamadas al modelo, que queda con el autor en nulo: es el historial de
 * costos de la organizacion y no le pertenece a la persona.
 */
export async function deleteAdvisor(input: AdvisorDelete, options: AdvisorDependencies = {}) {
  const { database, authorize } = advisorDependencies(options);
  const authorization = await authorize("admin");
  if (!authorization.ok) return authorization;

  const parsed = advisorDeleteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { code: "INVALID_ADVISOR" as const, message: z.prettifyError(parsed.error) },
    };
  }

  const lockout = selfLockoutError(authorization.data.id, parsed.data.advisorId, "cuenta");
  if (lockout) return { ok: false as const, error: lockout };

  const [target] = await database
    .select({ id: advisors.id, email: advisors.email, displayName: advisors.displayName })
    .from(advisors)
    .where(eq(advisors.id, parsed.data.advisorId))
    .limit(1);
  if (!target) {
    return {
      ok: false as const,
      error: { code: "ADVISOR_NOT_FOUND" as const, message: "La cuenta ya no existe." },
    };
  }

  // La comparacion ignora mayusculas y espacios, no la identidad: tiene que ser
  // el correo de ESTA cuenta y de ninguna otra.
  if (parsed.data.confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()) {
    return {
      ok: false as const,
      error: {
        code: "CONFIRMATION_MISMATCH" as const,
        message: `El correo no coincide. Escribe ${target.email} para confirmar.`,
        field: "confirmEmail",
      },
    };
  }

  return removeAdvisor(database, target, options.adminAuth);
}

async function removeAdvisor(
  database: AdvisorDatabase,
  target: { id: string; email: string; displayName: string },
  adminAuth?: { deleteUser: BorrarUsuario },
) {
  try {
    const [deleted] = await database
      .delete(advisors)
      .where(eq(advisors.id, target.id))
      .returning({ id: advisors.id, email: advisors.email, displayName: advisors.displayName });
    if (!deleted) {
      return {
        ok: false as const,
        error: { code: "ADVISOR_NOT_FOUND" as const, message: "La cuenta ya no existe." },
      };
    }

    const auth = adminAuth ?? createAdminSupabaseClient().auth.admin;
    const { error } = await auth.deleteUser(target.id);
    if (error) {
      // La fila ya no esta, asi que la persona no entra a ningun modulo. Se
      // reporta para que quede rastro de que su usuario de acceso sobrevivio.
      return {
        ok: false as const,
        error: {
          code: "AUTH_DELETE_FAILED" as const,
          message: `Se borró la cuenta de ${deleted.displayName}, y su acceso quedó pendiente de eliminar. Avisa a quien administre Supabase.`,
        },
      };
    }

    return { ok: true as const, data: deleted };
  } catch {
    return {
      ok: false as const,
      error: { code: "ADVISOR_DELETE_FAILED" as const, message: "No se pudo borrar la cuenta." },
    };
  }
}
