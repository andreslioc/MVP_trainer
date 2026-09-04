import { passwordSchema } from "../../lib/validation/password.ts";

/**
 * Escribe la contrasena de la cuenta que tiene la sesion.
 *
 * Recibe el cliente en vez de construirlo para poder comprobarse sin Supabase,
 * igual que `establish-session.ts` y `confirm-invitation.ts`.
 *
 * La regla que justifica este modulo: **una sesion no autoriza por si sola a
 * cambiar su contrasena**. Solo lo autoriza una de dos cosas, y las dos se
 * exigen aqui y en ningun otro sitio:
 *
 * 1. La sesion acaba de nacer de canjear un enlace de invitacion o de
 *    recuperacion. La cuenta todavia no tiene contrasena, asi que no hay una
 *    anterior que pedir.
 * 2. Quien pide el cambio escribe la contrasena ACTUAL de esa cuenta.
 *
 * Sin la segunda, cualquiera que llegue a la pantalla con una sesion ajena
 * abierta —el caso real: la admin abriendo el enlace de la invitacion que ella
 * misma acaba de mandar— sobrescribe la contrasena de esa sesion sin saberlo y
 * sin que nada falle en pantalla.
 */
type PasswordAuth = {
  updateUser: (attributes: { password: string }) => Promise<{ error: { message: string } | null }>;
  signInWithPassword: (credentials: {
    email: string;
    password: string;
  }) => Promise<{ error: { message: string } | null }>;
};

type PasswordContext = {
  /** El correo de la sesion, no uno que venga del formulario. */
  email: string;
  /** Si esta sesion nacio de canjear el enlace del correo. */
  fromInvitation: boolean;
};

export async function setPassword(auth: PasswordAuth, input: unknown, context: PasswordContext) {
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

  if (!context.fromInvitation) {
    const current = parsed.data.currentPassword?.trim();
    if (!current) {
      return {
        ok: false as const,
        error: {
          code: "CURRENT_PASSWORD_REQUIRED" as const,
          // El mensaje nombra la cuenta: es lo que delata el caso en que
          // alguien creia estar definiendo la contrasena de otra persona.
          message: `Escribe la contraseña actual de ${context.email} para cambiarla.`,
          field: "currentPassword",
        },
      };
    }

    // Se reautentica contra el proveedor porque no hay otra forma de verificar
    // una contrasena: no se guarda de este lado. Es la misma cuenta de la
    // sesion, asi que la cookie que devuelve es equivalente a la que ya habia.
    const { error } = await auth.signInWithPassword({
      email: context.email,
      password: current,
    });

    if (error) {
      return {
        ok: false as const,
        error: {
          code: "CURRENT_PASSWORD_INVALID" as const,
          message: "La contraseña actual no coincide.",
          field: "currentPassword",
        },
      };
    }
  }

  const { error } = await auth.updateUser({ password: parsed.data.password });

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

  return { ok: true as const, data: { email: context.email } };
}
