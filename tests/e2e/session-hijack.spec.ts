import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";

import { loadEnv } from "../../src/lib/load-env.ts";

/**
 * El escenario que costo el acceso a la cuenta de administracion en produccion.
 *
 * La admin creaba una cuenta, abria el enlace de la invitacion en SU navegador
 * para comprobar que el correo llegaba, y `/auth/confirm` la mandaba al
 * formulario de contrasena sin canjear el token. La contrasena que escribia
 * "para la persona nueva" caia sobre su propia sesion, la pantalla la llevaba a
 * `/app` como si todo hubiera salido bien, y su contrasena de siempre dejaba de
 * servir sin que nada lo anunciara.
 *
 * Se prueba con navegador porque la pieza que lo cierra es una cookie con
 * `path` propio: eso pasa cualquier prueba unitaria y se rompe en el navegador.
 */
async function createAdmin() {
  loadEnv();
  const [{ openDirectDatabase }, { advisors }, { getSupabaseAdminEnv }] = await Promise.all([
    import("../../src/db/client.ts"),
    import("../../src/db/schema.ts"),
    import("../../src/lib/env.ts"),
  ]);
  const connection = openDirectDatabase();
  const { url, secretKey } = getSupabaseAdminEnv();
  const adminClient = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const id = randomUUID();
  const email = `admin-hijack-${id}@example.test`;
  const password = "Local-test-only-5v!bQ4#t";
  const { error } = await adminClient.auth.admin.createUser({
    id,
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;

  await connection.db
    .insert(advisors)
    .values({ id, email, displayName: "Admin Hijack", role: "admin", status: "activa" });

  return {
    email,
    password,
    async cleanup() {
      await connection.db.delete(advisors).where(eq(advisors.id, id));
      await adminClient.auth.admin.deleteUser(id);
      await connection.close();
    },
  };
}

/** La ruta de verdad, no "/login?next=/app": esa tambien acaba en "/app". */
const EN_LA_APP = /^[^?]*\/app$/;

test("abrir el enlace de una invitación con sesión propia no cambia la contraseña de esa sesión", async ({
  page,
}) => {
  const admin = await createAdmin();

  try {
    await page.goto("/login?next=/app");
    await page.getByLabel("Correo").fill(admin.email);
    await page.getByLabel("Contraseña").fill(admin.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(EN_LA_APP);

    // El enlace del correo, sin token util: es lo que veia la admin al abrirlo
    // una segunda vez, o pasado el rato. Antes esto la depositaba en el
    // formulario con su propia sesion.
    await page.goto("/auth/confirm");
    await expect(page.getByText("El enlace no es válido", { exact: false })).toBeVisible();
    await expect(page).not.toHaveURL(/definir-contrasena/);

    // Y llegando a mano tampoco: la pantalla dice de quien es la cuenta y pide
    // la contrasena actual, asi que no hay forma de cambiarla sin saberla.
    await page.goto("/definir-contrasena");
    await expect(page.getByRole("heading", { name: "Cambia tu contraseña" })).toBeVisible();
    await expect(page.getByText(admin.email, { exact: false })).toBeVisible();

    await page.getByLabel("Contraseña actual").fill("esta-no-es-la-suya");
    await page.getByLabel("Contraseña nueva").fill("contrasena-secuestrada-1");
    await page.getByLabel("Repite la contraseña").fill("contrasena-secuestrada-1");
    await page.getByRole("button", { name: "Guardar y entrar" }).click();

    await expect(page.getByText("La contraseña actual no coincide")).toBeVisible();

    // Lo que de verdad importa: su contrasena sigue sirviendo.
    await page.context().clearCookies();
    await page.goto("/login?next=/app");
    await page.getByLabel("Correo").fill(admin.email);
    await page.getByLabel("Contraseña").fill(admin.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(EN_LA_APP);
  } finally {
    await admin.cleanup();
  }
});
