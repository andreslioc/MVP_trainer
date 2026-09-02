import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";

import { getSupabaseAdminEnv, getSupabasePublicEnv } from "../../src/lib/env.ts";
import { buildConfirmUrl } from "../../src/lib/invite-link.ts";
import { confirmInvitation } from "../../src/server/auth/confirm-invitation.ts";

/**
 * El flujo de invitacion completo contra el Supabase local.
 *
 * Existe porque la version anterior "pasaba" cualquier prueba de forma: el
 * codigo compilaba, la invitacion se enviaba y el correo llegaba. Lo que estaba
 * roto era el canje, y eso solo se ve recorriendo el camino entero. Aqui se
 * recorre sin navegador: `generateLink` devuelve el mismo `hashed_token` que
 * imprime la plantilla del correo con `{{ .TokenHash }}`.
 */
const { url, publishableKey } = getSupabasePublicEnv();
const { secretKey } = getSupabaseAdminEnv();
const adminClient = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Cliente sin sesion, como el que corre en el servidor al abrir el enlace. */
function clienteVisitante() {
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const creados: string[] = [];

async function invitar() {
  const email = `invitacion-${randomUUID()}@example.test`;
  const { data, error } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: buildConfirmUrl("http://127.0.0.1:3000") },
  });
  if (error) throw error;
  creados.push(data.user.id);
  return { email, tokenHash: data.properties.hashed_token };
}

afterEach(async () => {
  await Promise.all(creados.splice(0).map((id) => adminClient.auth.admin.deleteUser(id)));
});

describe("invitación por correo", () => {
  it("entrega un hash que viaja en el query string, no en el fragmento", async () => {
    const { tokenHash } = await invitar();

    // Es el dato que lo arregla todo: si existe un hash que se puede poner en
    // la URL, el servidor puede leerlo. El flujo roto dependia de un token que
    // solo el navegador veia.
    expect(typeof tokenHash).toBe("string");
    expect(tokenHash.length).toBeGreaterThan(0);
    expect(tokenHash).not.toContain("#");
  });

  it("canjea el hash por una sesión y permite definir la contraseña y entrar", async () => {
    const { email, tokenHash } = await invitar();
    const visitante = clienteVisitante();

    const confirmacion = await confirmInvitation(visitante.auth, {
      token_hash: tokenHash,
      type: "invite",
    });
    expect(confirmacion.ok).toBe(true);

    const { data: sesion } = await visitante.auth.getSession();
    expect(sesion.session?.user.email).toBe(email);

    const password = `Local-test-only-${randomUUID().slice(0, 8)}!aB3`;
    const { error: errorContrasena } = await visitante.auth.updateUser({ password });
    expect(errorContrasena).toBeNull();

    // La prueba de que la cuenta quedo usable: entra con correo y contrasena,
    // que es lo unico que ofrece la pantalla de login.
    const nuevaSesion = clienteVisitante();
    const { error: errorLogin } = await nuevaSesion.auth.signInWithPassword({ email, password });
    expect(errorLogin).toBeNull();
  });

  it("invalida el hash después del primer uso", async () => {
    const { tokenHash } = await invitar();

    const primero = await confirmInvitation(clienteVisitante().auth, {
      token_hash: tokenHash,
      type: "invite",
    });
    expect(primero.ok).toBe(true);

    // Es exactamente el `otp_expired` que aparecia en la URL: el segundo clic
    // sobre el mismo enlace. Ahora produce un mensaje con salida en vez de una
    // pantalla en blanco.
    const segundo = await confirmInvitation(clienteVisitante().auth, {
      token_hash: tokenHash,
      type: "invite",
    });
    expect(segundo.ok).toBe(false);
    if (segundo.ok) return;
    expect(segundo.error.code).toBe("LINK_EXPIRED");
  });

  it("rechaza un hash inventado", async () => {
    const result = await confirmInvitation(clienteVisitante().auth, {
      token_hash: "hash-que-nadie-emitio",
      type: "invite",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("LINK_EXPIRED");
  });
});
