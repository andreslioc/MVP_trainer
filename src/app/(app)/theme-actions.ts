"use server";

import { cookies } from "next/headers";

import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, parseTheme } from "../../lib/theme.ts";

/**
 * Guarda la preferencia de tema.
 *
 * La cookie la escribe el SERVIDOR y no `document.cookie`: asi lleva los
 * atributos correctos en un solo lugar y el navegador no tiene que saber de
 * `samesite` ni de `max-age`. No es para el render actual —el interruptor ya
 * cambio el atributo en el mismo clic— sino para el siguiente, donde el
 * servidor la lee y estampa `data-theme` antes de pintar.
 *
 * No valida rol a proposito: es una preferencia de color del propio navegador,
 * no un dato del negocio. Lo que si hace es normalizar la entrada, para que un
 * valor inventado caiga en "sistema" y no llegue crudo a la cookie.
 */
export async function setThemeAction(value: string) {
  const theme = parseTheme(value);
  (await cookies()).set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: THEME_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
  return { ok: true as const, data: theme };
}
