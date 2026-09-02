/**
 * A donde vuelve el enlace de una invitacion.
 *
 * El flujo original no pasaba `redirectTo`, asi que Supabase devolvia a la
 * Site URL del proyecto —la raiz— con el token en el FRAGMENTO de la URL
 * (`#access_token=...`). El fragmento no viaja al servidor: `proxy.ts` no veia
 * sesion, redirigia a `/login` y el token se perdia. Ninguna invitacion podia
 * completarse, y el unico sintoma visible era un `otp_expired` al segundo clic.
 *
 * La correccion es la via de `token_hash`: la plantilla del correo arma la URL
 * con el hash en el QUERY STRING, que si llega al servidor, y una ruta lo
 * canjea por sesion. Este modulo es el unico lugar que sabe como se arma esa
 * URL, y no importa nada para poder comprobarse sin base ni red.
 */

/** Ruta que canjea el hash del correo por una sesion. Sin sesion previa. */
export const CONFIRM_PATH = "/auth/confirm";

/** Ruta donde la cuenta invitada define su contrasena. Exige sesion. */
export const PASSWORD_PATH = "/definir-contrasena";

/**
 * Tipos de enlace que `/auth/confirm` acepta.
 *
 * `recovery` entra junto a `invite` porque los dos llegan por el mismo canal y
 * se canjean con la misma llamada: rechazarlo seria un fallo el dia que exista
 * un "olvide mi contrasena". La pantalla de destino es la misma, porque en los
 * dos casos lo siguiente es escribir una contrasena nueva.
 */
export const CONFIRM_TYPES = ["invite", "recovery"] as const;
export type ConfirmType = (typeof CONFIRM_TYPES)[number];

/**
 * La URL absoluta que se le pasa a Supabase como `redirectTo`.
 *
 * Tiene que estar en la lista de URLs permitidas del proyecto, o Supabase la
 * ignora y cae de vuelta a la Site URL. `localhost` y `127.0.0.1` son origenes
 * DISTINTOS para esa lista: los dos van declarados en `supabase/config.toml`.
 */
export function buildConfirmUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!base) {
    throw new Error("APP_BASE_URL esta vacia: sin ella la invitacion no sabe a donde volver.");
  }
  return `${base}${CONFIRM_PATH}`;
}
