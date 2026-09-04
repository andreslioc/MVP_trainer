"use server";

import { createServerSupabaseClient } from "../../../lib/auth.ts";
import { confirmInvitation } from "../../../server/auth/confirm-invitation.ts";
import { establishSession } from "../../../server/auth/establish-session.ts";
import { markInvitationRedeemed } from "../../../server/auth/invitation-marker.ts";

/**
 * Las dos formas en que puede llegar una invitacion, como server actions.
 *
 * Son acciones y no un route handler ni la propia pagina por una razon concreta
 * de Next: un Server Component NO puede escribir cookies —el store las descarta
 * en silencio— y aqui hay que escribir la cookie de sesion. Una server action
 * si puede, y ese es todo el motivo de que estas dos funciones existan.
 */
export async function confirmarEnlaceAction(input: { token_hash: string; type: string }) {
  const supabase = await createServerSupabaseClient();
  const result = await confirmInvitation(supabase.auth, input);
  if (result.ok) {
    await markInvitationRedeemed();
  }
  return result;
}

export async function establecerSesionAction(input: { accessToken: string; refreshToken: string }) {
  const supabase = await createServerSupabaseClient();
  const result = await establishSession(supabase.auth, input);
  if (result.ok) {
    await markInvitationRedeemed();
  }
  return result;
}

/**
 * Canjear el token es lo unico que autoriza a `/definir-contrasena` a escribir
 * sin pedir la contrasena anterior, asi que el marcador se pone AQUI —en las dos
 * formas del enlace— y en ningun otro lugar. Ponerlo antes, o dejar que la
 * pantalla lo asuma por tener sesion, es exactamente el agujero que existia.
 */
