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
 *
 * NO atajaba hacia `/definir-contrasena` cuando ya habia sesion, y ese atajo
 * era un secuestro: quien abria el enlace de una invitacion teniendo su propia
 * sesion abierta —la admin que acaba de crear la cuenta y hace clic para
 * probar— pasaba de largo sin canjear el token, llegaba al formulario con SU
 * sesion, y `updateUser({ password })` le cambiaba la contrasena a ELLA en vez
 * de a la invitada. Su contrasena anterior dejaba de servir en ese instante.
 *
 * El token del correo se canjea SIEMPRE. Es lo unico que decide de quien es la
 * sesion que va a recibir la contrasena, y solo el navegador puede leerlo
 * cuando viene en el fragmento: por eso la decision es del cliente y no de
 * aqui.
 */
export default function ConfirmarInvitacionPage() {
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
