"use server";

import { createServerSupabaseClient, getSession } from "../../lib/auth.ts";
import type { PasswordInput } from "../../lib/validation/password.ts";
import { clearInvitationMarker, hasInvitationMarker } from "../../server/auth/invitation-marker.ts";
import { setPassword } from "../../server/auth/set-password.ts";

/**
 * Define la contrasena de la cuenta que tiene la sesion.
 *
 * Exige sesion aunque `proxy.ts` ya la exija: una server action es una entrada
 * HTTP propia y se puede invocar sin pasar por la pagina. La comprobacion aqui
 * no es redundante, es el limite real. Por lo mismo el marcador del canje se
 * vuelve a leer aqui y no se recibe como argumento: un parametro lo pondria en
 * manos de quien llama, y es lo unico que decide si se pide la contrasena
 * anterior.
 */
export async function setPasswordAction(input: PasswordInput) {
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
  const result = await setPassword(supabase.auth, input, {
    email: session.data.email,
    fromInvitation: await hasInvitationMarker(),
  });

  // El marcador autoriza UN cambio. Se quema al gastarlo, no al vencer.
  if (result.ok) {
    await clearInvitationMarker();
  }

  return result;
}
