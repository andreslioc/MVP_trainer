import { redirect } from "next/navigation";

import { getSession } from "../../../lib/auth.ts";
import { PASSWORD_PATH } from "../../../lib/invite-link.ts";
import { ConfirmClient } from "./confirm-client.tsx";

/**
 * Donde aterriza el enlace del correo de invitacion.
 *
 * Es una pagina y no un route handler porque el enlace de la plantilla por
 * defecto trae los tokens en el fragmento de la URL, y eso solo lo puede leer
 * codigo que corra en el navegador. La pagina es la cascara; el trabajo lo hace
 * `ConfirmClient` llamando a server actions, que son las que si pueden escribir
 * la cookie de sesion.
 *
 * Se visita SIN sesion, asi que `proxy.ts` la exceptua por nombre.
 */
export default async function ConfirmarInvitacionPage() {
  const session = await getSession();
  if (session.ok) {
    redirect(PASSWORD_PATH);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <section className="w-full rounded-card border border-border bg-surface p-8">
        <p className="text-sm font-medium text-primary">Super Store Sales OS</p>
        <h1 className="mt-2 text-3xl font-semibold text-fg">Tu invitación</h1>
        <ConfirmClient />
      </section>
    </main>
  );
}
