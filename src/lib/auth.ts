import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "../db/client.ts";
import { advisors } from "../db/schema.ts";
import { env, getSupabaseAdminEnv, getSupabasePublicEnv } from "./env.ts";

export type AdvisorRole = "asesor" | "admin";
type AuthVerifier = Pick<SupabaseClient["auth"], "getClaims" | "signOut">;
type AdvisorReader = Pick<typeof db, "select">;

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabasePublicEnv();

  return createServerClient(url, publishableKey, {
    cookieOptions: {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot always write cookies. proxy.ts refreshes
          // them before rendering, while actions and route handlers can write.
        }
      },
    },
  });
}

export function createAdminSupabaseClient() {
  const { url, secretKey } = getSupabaseAdminEnv();
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function resolveVerifiedSession(auth: AuthVerifier, database: AdvisorReader = db) {
  const { data, error } = await auth.getClaims();
  const subject = data?.claims.sub;

  if (error || typeof subject !== "string") {
    return {
      ok: false as const,
      error: { code: "UNAUTHENTICATED" as const, message: "La sesión no es válida." },
    };
  }

  const [advisor] = await database.select().from(advisors).where(eq(advisors.id, subject)).limit(1);

  if (advisor?.status !== "activa") {
    await auth.signOut({ scope: "local" });
    return {
      ok: false as const,
      error: { code: "FORBIDDEN" as const, message: "La cuenta no está activa." },
    };
  }

  return { ok: true as const, data: advisor };
}

export async function getSession() {
  const supabase = await createServerSupabaseClient();
  return resolveVerifiedSession(supabase.auth);
}

export async function requireRole(requiredRole: AdvisorRole) {
  const session = await getSession();
  if (!session.ok) {
    return session;
  }

  if (requiredRole === "admin" && session.data.role !== "admin") {
    return {
      ok: false as const,
      error: { code: "FORBIDDEN" as const, message: "No tienes permiso para esta acción." },
    };
  }

  return session;
}

export async function refreshAuth(request: NextRequest) {
  const { url, publishableKey } = getSupabasePublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookieOptions: {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [name, value] of Object.entries(headers)) {
          response.headers.set(name, value);
        }
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  return { authenticated: !error && typeof data?.claims.sub === "string", response };
}

export function copyAuthCookies(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  for (const header of ["cache-control", "expires", "pragma"] as const) {
    const value = source.headers.get(header);
    if (value) {
      target.headers.set(header, value);
    }
  }
  return target;
}
