import { z } from "zod";

import { CONFIRM_TYPES } from "../../lib/invite-link.ts";

/**
 * Canje del enlace del correo por una sesion.
 *
 * Recibe el verificador en vez de construirlo para poder comprobarse sin
 * Supabase: el caso que importa —un enlace ya usado o vencido— es justo el que
 * no se puede provocar contra un servidor real de forma repetible.
 */
type OtpVerifier = {
  verifyOtp: (params: {
    type: (typeof CONFIRM_TYPES)[number];
    token_hash: string;
  }) => Promise<{ error: { message: string } | null }>;
};

/**
 * Los parametros vienen del query string, no del fragmento.
 *
 * `token_hash` es lo que imprime la plantilla del correo con `{{ .TokenHash }}`.
 * No es el token en claro: es su hash, y por eso se puede llevar en la URL y
 * quedar en los registros del servidor sin regalar el acceso.
 */
export const confirmParamsSchema = z.object({
  token_hash: z.string().trim().min(1),
  type: z.enum(CONFIRM_TYPES),
});

export async function confirmInvitation(auth: OtpVerifier, params: unknown) {
  const parsed = confirmParamsSchema.safeParse(params);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: {
        code: "INVALID_LINK" as const,
        message: "El enlace no es válido. Pide una invitación nueva.",
      },
    };
  }

  const { error } = await auth.verifyOtp({
    token_hash: parsed.data.token_hash,
    type: parsed.data.type,
  });

  // Supabase no distingue "vencido" de "ya usado" en el codigo de error, y para
  // quien lo recibe da igual: en los dos casos la salida es la misma, pedir una
  // invitacion nueva. Un mensaje que prometa distinguirlos mentiria.
  if (error) {
    return {
      ok: false as const,
      error: {
        code: "LINK_EXPIRED" as const,
        message: "El enlace ya se usó o venció. Pide una invitación nueva.",
      },
    };
  }

  return { ok: true as const, data: { type: parsed.data.type } };
}
