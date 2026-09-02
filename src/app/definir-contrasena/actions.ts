"use server";

import { createServerSupabaseClient, getSession } from "../../lib/auth.ts";
import { type PasswordInput, passwordSchema } from "../../lib/validation/password.ts";

/**
 * Define la contrasena de la cuenta que acaba de aceptar su invitacion.
 *
 * Exige sesion aunque `proxy.ts` ya la exija: una server action es una entrada
 * HTTP propia y se puede invocar sin pasar por la pagina. La comprobacion aqui
 * no es redundante, es el limite real.
 */
export async function setPasswordAction(input: PasswordInput) {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false as const,
      error: {
        code: "INVALID_PASSWORD" as const,
        message: issue?.message ?? "La contraseña no es válida.",
        field: issue?.path[0]?.toString(),
      },
    };
  }

  const session = await getSession();
  if (!session.ok) {
    return {
      ok: false as const,
      error: {
        code: "UNAUTHENTICATED" as const,
        message: "El enlace ya no tiene sesión. Pide una invitación nueva.",
      },
    };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return {
      ok: false as const,
      // El mensaje del proveedor llega en ingles y describe su propia regla
      // —longitud, contrasena filtrada—. Se muestra tal cual porque es
      // accionable, y traducirlo a un generico dejaria a la persona sin saber
      // que cambiar.
      error: { code: "PASSWORD_REJECTED" as const, message: error.message },
    };
  }

  return { ok: true as const, data: { email: session.data.email } };
}
