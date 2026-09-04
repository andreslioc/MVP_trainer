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
type Resultado = { ok: true } | { ok: false; error: { message: string } };

/**
 * Los canjes EN VUELO, por token.
 *
 * Canjear un token es de un solo uso, y React monta este componente dos veces:
 * en desarrollo StrictMode monta, desmonta y vuelve a montar. Los dos montajes
 * arrancan en el MISMO milisegundo —medido—, asi que ninguno alcanza a ver el
 * resultado del otro: recordar el resultado no sirve de nada, ni en una variable
 * del modulo ni en `sessionStorage`. Los dos llamaban al servidor con el mismo
 * hash, el primero lo canjeaba y el segundo se encontraba el token quemado; el
 * que se pintaba era el segundo, asi que una invitacion que acababa de
 * funcionar mostraba "el enlace ya se uso o vencio".
 *
 * Lo que se comparte es la PROMESA, no su resultado: el segundo montaje se
 * engancha a la llamada que ya esta en curso en vez de hacer otra. Es lo unico
 * que sirve cuando los dos empiezan a la vez.
 */
const enVuelo = new Map<string, Promise<Resultado>>();

function canjearUnaVez(token: string, ejecutar: () => Promise<Resultado>) {
  const existente = enVuelo.get(token);
  if (existente) {
    return existente;
  }
  const promesa = ejecutar();
  enVuelo.set(token, promesa);
  return promesa;
}

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

      // El token identifica el canje. Del par del fragmento basta el de acceso:
      // los dos llegan juntos y no se reparten entre enlaces.
      const clave = tokenHash ?? accessToken ?? "";

      const resultado = await canjearUnaVez(clave, () =>
        accessToken && refreshToken
          ? establecerSesionAction({ accessToken, refreshToken })
          : tokenHash
            ? confirmarEnlaceAction({ token_hash: tokenHash, type: consulta.get("type") ?? "" })
            : Promise.resolve({
                ok: false as const,
                error: { message: "El enlace no es válido. Pide una invitación nueva." },
              }),
      );

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
