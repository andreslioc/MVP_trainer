import { redirect } from "next/navigation";

import { getSession } from "../../lib/auth.ts";
import { PasswordForm } from "./password-form.tsx";

/**
 * Donde termina una invitacion aceptada.
 *
 * Llega aqui con sesion ya creada por `/auth/confirm`, pero SIN contrasena: es
 * el unico momento en que la cuenta existe y no puede volver a entrar sola. Por
 * eso la pagina no ofrece salida hacia la app hasta que el formulario guarde.
 */
export default async function DefinirContrasenaPage() {
  const session = await getSession();
  if (!session.ok) {
    redirect("/login?error=UNAUTHENTICATED");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <section className="w-full rounded-card border border-border bg-surface p-8">
        <p className="text-sm font-medium text-primary">Super Store Sales OS</p>
        <h1 className="mt-2 text-3xl font-semibold text-fg">Crea tu contraseña</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Tu cuenta ya está activa como {session.data.email}. Define una contraseña para entrar de
          ahora en adelante.
        </p>

        <PasswordForm />
      </section>
    </main>
  );
}
