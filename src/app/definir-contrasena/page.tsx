import { redirect } from "next/navigation";

import { getSession } from "../../lib/auth.ts";
import { hasInvitationMarker } from "../../server/auth/invitation-marker.ts";
import { PasswordForm } from "./password-form.tsx";

/**
 * Donde termina una invitacion aceptada, y tambien donde alguien cambia su
 * propia contrasena.
 *
 * Atiende las dos llegadas y NO las confunde, porque confundirlas fue el fallo:
 * quien viene de canjear un enlace no tiene contrasena anterior que escribir, y
 * quien llega con una sesion cualquiera si la tiene y se le exige. El titulo
 * tambien cambia — "Crea tu contraseña" sobre la sesion de otra persona es justo
 * lo que hacia pasar por rutina un cambio que no lo era.
 */
export default async function DefinirContrasenaPage() {
  const session = await getSession();
  if (!session.ok) {
    redirect("/login?error=UNAUTHENTICATED");
  }

  const desdeInvitacion = await hasInvitationMarker();

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <section className="w-full rounded-card border border-border bg-surface p-8">
        <p className="text-sm font-medium text-primary">Super Store Sales OS</p>
        <h1 className="mt-2 text-3xl font-semibold text-fg">
          {desdeInvitacion ? "Crea tu contraseña" : "Cambia tu contraseña"}
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          {desdeInvitacion ? (
            <>
              Tu cuenta ya está activa como {session.data.email}. Define una contraseña para entrar
              de ahora en adelante.
            </>
          ) : (
            <>
              Vas a cambiar la contraseña de{" "}
              <strong className="font-semibold">{session.data.email}</strong>, la cuenta con la que
              estás dentro ahora mismo. Si querías definir la contraseña de otra persona, esta no es
              la pantalla: ella recibe su propio enlace por correo.
            </>
          )}
        </p>

        <PasswordForm requiereActual={!desdeInvitacion} />
      </section>
    </main>
  );
}
