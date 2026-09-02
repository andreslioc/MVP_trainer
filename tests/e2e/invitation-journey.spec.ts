import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { type Page, expect, test } from "@playwright/test";

import { loadEnv } from "../../src/lib/load-env.ts";

/**
 * El recorrido completo de una invitacion, tal como lo vive una persona.
 *
 * Existe porque el fallo que arreglo se veia SOLO aqui: el codigo compilaba, el
 * correo llegaba y el enlace abria una pantalla de error. Cada pieza por
 * separado parecia correcta.
 *
 * Hay DOS caminos y los dos se prueban, porque cual se usa no lo decide este
 * repositorio:
 *
 * 1. Plantilla por defecto de Supabase — la unica disponible cuando el proyecto
 *    no tiene SMTP propio. Devuelve la sesion en el FRAGMENTO de la URL.
 * 2. Plantilla propia con `{{ .TokenHash }}` — disponible al activar SMTP.
 *    Devuelve el hash en el query string.
 *
 * Estas pruebas toman una sesion de navegador, que el resto del e2e evita. Aqui
 * esta justificado: la sesion no se siembra, se GANA recorriendo el flujo que se
 * prueba. Es el sujeto de la prueba, no su andamio.
 */

const BASE = "http://127.0.0.1:3101";

/** La parte de navegador, identica para los dos caminos. */
async function crearContrasenaYEntrar(page: Page, email: string, enlace: string) {
  await page.goto(enlace);
  await expect(page).toHaveURL(/\/definir-contrasena$/, { timeout: 20000 });
  await expect(page.getByRole("heading", { name: "Crea tu contraseña" })).toBeVisible();
  await expect(page.getByText(email, { exact: false })).toBeVisible();

  // Los tokens no pueden quedar en la barra de direcciones al terminar: de ahi
  // pasan al historial y a cualquier URL que se comparta.
  expect(page.url()).not.toContain("access_token");

  const password = `Local-only-${randomUUID().slice(0, 8)}!aB3`;
  await page.getByLabel("Contraseña nueva").fill(password);
  await page.getByLabel("Repite la contraseña").fill(password);
  await page.getByRole("button", { name: "Guardar y entrar" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 20000 });

  // Lo que prueba que la cuenta quedo usable: salir y volver a entrar con la
  // contrasena que acaba de crear, que es lo unico que ofrece el login.
  await page.goto("/logout");
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 20000 });
}

async function abrirEntorno() {
  loadEnv();
  const [{ openDirectDatabase }, { advisors }, { getSupabaseAdminEnv, getSupabasePublicEnv }] =
    await Promise.all([
      import("../../src/db/client.ts"),
      import("../../src/db/schema.ts"),
      import("../../src/lib/env.ts"),
    ]);
  const { buildConfirmUrl } = await import("../../src/lib/invite-link.ts");
  const { url } = getSupabasePublicEnv();
  const { secretKey } = getSupabaseAdminEnv();

  return {
    connection: openDirectDatabase("supabase"),
    advisors,
    admin: createClient(url, secretKey, { auth: { persistSession: false } }),
    redirectTo: buildConfirmUrl(BASE),
  };
}

test("recorrido con la plantilla POR DEFECTO: la sesión llega en el fragmento", async ({
  page,
}) => {
  const { connection, advisors, admin, redirectTo } = await abrirEntorno();
  const email = `recorrido-frag-${randomUUID().slice(0, 8)}@example.test`;
  let userId = "";

  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo, data: { display_name: "Recorrido Fragmento" } },
    });
    if (error) throw error;
    userId = data.user.id;
    await connection.db
      .insert(advisors)
      .values({ id: userId, email, displayName: "Recorrido Fragmento", status: "activa" });

    // `action_link` es exactamente el enlace que imprime la plantilla que no se
    // puede editar sin SMTP: pasa por /auth/v1/verify y vuelve con un `#`.
    expect(data.properties.action_link).toContain("/auth/v1/verify");
    await crearContrasenaYEntrar(page, email, data.properties.action_link);
  } finally {
    if (userId) {
      await connection.db.delete(advisors).where(eq(advisors.id, userId));
      await admin.auth.admin.deleteUser(userId);
    }
    await connection.close();
  }
});

test("recorrido con plantilla PROPIA: el hash llega en el query string", async ({ page }) => {
  const { connection, advisors, admin, redirectTo } = await abrirEntorno();
  const email = `recorrido-hash-${randomUUID().slice(0, 8)}@example.test`;
  let userId = "";

  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo, data: { display_name: "Recorrido Hash" } },
    });
    if (error) throw error;
    userId = data.user.id;
    await connection.db
      .insert(advisors)
      .values({ id: userId, email, displayName: "Recorrido Hash", status: "activa" });

    await crearContrasenaYEntrar(
      page,
      email,
      `${redirectTo}?token_hash=${data.properties.hashed_token}&type=invite`,
    );
  } finally {
    if (userId) {
      await connection.db.delete(advisors).where(eq(advisors.id, userId));
      await admin.auth.admin.deleteUser(userId);
    }
    await connection.close();
  }
});
