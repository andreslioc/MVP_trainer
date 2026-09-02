import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { copyAuthCookies, refreshAuth } from "./src/lib/auth.ts";
import { CONFIRM_PATH } from "./src/lib/invite-link.ts";

/**
 * Rutas que se visitan SIN sesion.
 *
 * `/auth/confirm` esta aqui porque es el enlace del correo de invitacion: llega
 * antes de que exista sesion, y si el proxy lo mandara a `/login` el token se
 * perderia sin que nadie lo canjeara. Ese era justo el fallo del flujo anterior.
 *
 * ESTE es el proxy que Next carga. Habia un segundo archivo en `src/proxy.ts`,
 * copia del mismo portero, que Next NO usaba: cuando existen los dos gana el de
 * la raiz. Se borro, porque un duplicado del control de acceso hace creer que
 * una ruta esta protegida cuando la edicion se fue al archivo muerto.
 */
const PUBLIC_PATHS = new Set<string>(["/login", CONFIRM_PATH]);

export async function proxy(request: NextRequest) {
  const { authenticated, response } = await refreshAuth(request);
  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/login";

  if (!authenticated && !PUBLIC_PATHS.has(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return copyAuthCookies(response, NextResponse.redirect(loginUrl));
  }

  if (authenticated && isLogin) {
    return copyAuthCookies(response, NextResponse.redirect(new URL("/app", request.url)));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!health|api/transcription-callback|api/cron(?:/|$)|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
