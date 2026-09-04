import { cookies } from "next/headers";

import { env } from "../../lib/env.ts";

/**
 * La prueba de que esta sesion nacio de canjear un enlace de invitacion.
 *
 * Existe porque `/definir-contrasena` no puede confiar en "hay sesion". Esa
 * pantalla escribe una contrasena sobre la sesion activa, y sin saber de donde
 * salio esa sesion le cambiaba la contrasena a quien pasara por ahi: la admin
 * que abria el enlace de una invitacion con su propia sesion abierta terminaba
 * cambiando la SUYA, entraba a la app con normalidad, y descubria el destrozo
 * en el siguiente inicio de sesion. Supabase no expone si una cuenta ya tiene
 * contrasena, asi que el dato no se puede consultar: hay que anotarlo en el
 * unico momento en que se sabe, justo despues de canjear el token.
 *
 * Es httpOnly y de vida corta como la cookie de sesion, y se limita a la ruta
 * que la consume: no tiene por que viajar en el resto de la app.
 */
export const INVITATION_MARKER = "invitacion_canjeada";

/** Lo que tarda alguien en escribir dos veces una contrasena, con margen. */
const TTL_SECONDS = 15 * 60;

const COOKIE_PATH = "/definir-contrasena";

export async function markInvitationRedeemed() {
  const store = await cookies();
  store.set(INVITATION_MARKER, "1", {
    httpOnly: true,
    maxAge: TTL_SECONDS,
    path: COOKIE_PATH,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
  });
}

export async function hasInvitationMarker() {
  const store = await cookies();
  return store.get(INVITATION_MARKER)?.value === "1";
}

/**
 * Se borra en cuanto la contrasena queda guardada: el marcador autoriza UN
 * cambio, no una ventana de quince minutos en la que la pantalla siga abierta.
 */
export async function clearInvitationMarker() {
  const store = await cookies();
  store.set(INVITATION_MARKER, "", {
    httpOnly: true,
    maxAge: 0,
    path: COOKIE_PATH,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
  });
}
