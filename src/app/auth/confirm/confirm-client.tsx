"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PASSWORD_PATH } from "../../../lib/invite-link.ts";
import { confirmarEnlaceAction, establecerSesionAction } from "./actions.ts";

/**
 * Lee el enlace de la invitacion y lo convierte en sesion.
 *
 * Es cliente por una sola razon: la plantilla de correo por defecto de Supabase
 * devuelve los tokens en el FRAGMENTO de la URL, y el fragmento no se envia al
 * servidor. Nadie mas que el navegador puede leerlo. Todo lo demas —verificar,
 * escribir la cookie— pasa en el servidor, en una server action.
 *
 * Atiende las dos formas del enlace, en este orden:
 *
 * 1. `#access_token=...&refresh_token=...` — plantilla por defecto, la que se
 *    usa cuando el proyecto no tiene SMTP propio y no permite editar plantillas.
 * 2. `?token_hash=...&type=invite` — plantilla propia, disponible al activar
 *    SMTP. No usa el fragmento en ningun momento.
 *
 * Las dos acaban igual, asi que activar SMTP mas adelante no cambia nada aqui.
 */
export function ConfirmClient() {
  const router = useRouter();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelado = false;

    async function resolver() {
      const fragmento = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const consulta = new URLSearchParams(window.location.search);

      // El propio Supabase puede devolver el error en el fragmento —es el
      // `#error=access_denied&error_code=otp_expired` que veiamos—. Se traduce
      // aqui en vez de dejar la pantalla en blanco.
      if (fragmento.get("error") || consulta.get("error")) {
        setError("El enlace ya se usó o venció. Pide una invitación nueva.");
        return;
      }

      const accessToken = fragmento.get("access_token");
      const refreshToken = fragmento.get("refresh_token");
      const tokenHash = consulta.get("token_hash");

      const resultado =
        accessToken && refreshToken
          ? await establecerSesionAction({ accessToken, refreshToken })
          : tokenHash
            ? await confirmarEnlaceAction({
                token_hash: tokenHash,
                type: consulta.get("type") ?? "",
              })
            : {
                ok: false as const,
                error: { message: "El enlace no es válido. Pide una invitación nueva." },
              };

      if (cancelado) return;

      if (!resultado.ok) {
        setError(resultado.error.message);
        return;
      }

      // Se limpia el fragmento antes de navegar: si no, los tokens quedan en el
      // historial del navegador y en lo que se pega al compartir la URL.
      window.history.replaceState(null, "", window.location.pathname);
      router.replace(PASSWORD_PATH);
    }

    void resolver();
    return () => {
      cancelado = true;
    };
  }, [router]);

  if (error) {
    return (
      <>
        <p
          className="mt-4 rounded-card border border-destructive bg-confidence-low-bg p-3 text-sm text-confidence-low-fg"
          role="alert"
        >
          {error}
        </p>
        <a className="mt-4 inline-block text-sm font-medium text-primary underline" href="/login">
          Ir a inicio de sesión
        </a>
      </>
    );
  }

  return (
    <p aria-live="polite" className="mt-4 text-sm text-fg-muted">
      Validando tu invitación…
    </p>
  );
}
