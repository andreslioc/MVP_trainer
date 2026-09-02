"use server";

import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "../../lib/auth.ts";

/**
 * `scope: "local"` a proposito: cierra esta sesion, no las de los otros
 * dispositivos de la asesora. Salir del computador de la tienda no deberia
 * tumbarle la sesion del telefono en mitad de un live.
 */
export async function logout() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
