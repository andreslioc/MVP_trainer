"use server";

import { createServerSupabaseClient } from "../../../lib/auth.ts";
import { confirmInvitation } from "../../../server/auth/confirm-invitation.ts";
import { establishSession } from "../../../server/auth/establish-session.ts";

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
  return confirmInvitation(supabase.auth, input);
}

export async function establecerSesionAction(input: { accessToken: string; refreshToken: string }) {
  const supabase = await createServerSupabaseClient();
  return establishSession(supabase.auth, input);
}
