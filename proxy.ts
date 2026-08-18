import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { copyAuthCookies, refreshAuth } from "./src/lib/auth.ts";

export async function proxy(request: NextRequest) {
  const { authenticated, response } = await refreshAuth(request);
  const isLogin = request.nextUrl.pathname === "/login";

  if (!authenticated && !isLogin) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
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
