"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createServerSupabaseClient, resolveVerifiedSession } from "../../lib/auth.ts";
import { logFailure } from "../../lib/log.ts";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

function safeNextPath(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/app";
}

export async function login(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });

  if (!parsed.success) {
    logFailure("login/entrada", z.prettifyError(parsed.error));
    redirect("/login?error=INVALID_CREDENTIALS");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // El usuario ve un mensaje generico a proposito —decirle si el correo
    // existe convierte el login en un enumerador de cuentas—, pero el servidor
    // tiene que poder distinguir "contrasena mala" de "llave publishable
    // rotada" o "proyecto equivocado": los tres llegan aqui iguales y en
    // produccion no dejaban ni una pista.
    logFailure(
      "login/supabase",
      `${error.status ?? "sin status"} ${error.code ?? ""} ${error.message}`,
    );
    redirect("/login?error=INVALID_CREDENTIALS");
  }

  const session = await resolveVerifiedSession(supabase.auth);
  if (!session.ok) {
    logFailure("login/sesion", session.error.code);
    redirect(`/login?error=${session.error.code}`);
  }

  redirect(safeNextPath(parsed.data.next));
}
