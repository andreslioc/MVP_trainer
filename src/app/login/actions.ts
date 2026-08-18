"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createServerSupabaseClient, resolveVerifiedSession } from "../../lib/auth.ts";

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
    redirect("/login?error=INVALID_CREDENTIALS");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    redirect("/login?error=INVALID_CREDENTIALS");
  }

  const session = await resolveVerifiedSession(supabase.auth);
  if (!session.ok) {
    redirect(`/login?error=${session.error.code}`);
  }

  redirect(safeNextPath(parsed.data.next));
}
