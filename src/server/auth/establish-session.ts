import { z } from "zod";

/**
 * Canje de los tokens que llegan en el FRAGMENTO de la URL.
 *
 * Es el camino de la plantilla de correo por defecto de Supabase, la que no se
 * puede editar sin SMTP propio. Su enlace pasa por `/auth/v1/verify`, que
 * verifica el token y responde con un redirect que lleva la sesion ya creada
 * detras de un `#`:
 *
 *   /auth/confirm#access_token=...&refresh_token=...&type=invite
 *
 * El fragmento no viaja al servidor. Solo el navegador lo ve, asi que los
 * tokens tienen que volver desde el cliente para que la sesion se guarde en una
 * cookie httpOnly, que es como las guarda el resto de la app. La alternativa
 * —un cliente de Supabase en el navegador— escribiria cookies legibles por
 * JavaScript, y este proyecto las quiere httpOnly.
 *
 * Los tokens que se reciben aqui NO son una credencial nueva: quien abre el
 * enlace ya los tiene en su barra de direcciones. Esto solo los mueve al sitio
 * donde el servidor puede usarlos.
 */
type SessionSetter = {
  setSession: (params: {
    access_token: string;
    refresh_token: string;
  }) => Promise<{ error: { message: string } | null }>;
};

export const sessionTokensSchema = z.object({
  accessToken: z.string().trim().min(1),
  refreshToken: z.string().trim().min(1),
});

export async function establishSession(auth: SessionSetter, input: unknown) {
  const parsed = sessionTokensSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: {
        code: "INVALID_LINK" as const,
        message: "El enlace no es válido. Pide una invitación nueva.",
      },
    };
  }

  const { error } = await auth.setSession({
    access_token: parsed.data.accessToken,
    refresh_token: parsed.data.refreshToken,
  });

  if (error) {
    return {
      ok: false as const,
      error: {
        code: "LINK_EXPIRED" as const,
        message: "El enlace ya se usó o venció. Pide una invitación nueva.",
      },
    };
  }

  return { ok: true as const, data: null };
}
