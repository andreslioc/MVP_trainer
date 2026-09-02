import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";

import { loadEnv } from "../../src/lib/load-env.ts";

/**
 * El borrado de cuenta, mirado de verdad: el aviso, la confirmacion escrita y
 * que el boton no se habilite hasta que el correo coincida.
 */
test("borrar una cuenta pide escribir el correo y avisa que se lleva", async ({ page }) => {
  loadEnv();
  const [{ openDirectDatabase }, schema, { getSupabaseAdminEnv }] = await Promise.all([
    import("../../src/db/client.ts"),
    import("../../src/db/schema.ts"),
    import("../../src/lib/env.ts"),
  ]);
  const connection = openDirectDatabase();
  const { url, secretKey } = getSupabaseAdminEnv();
  const authAdmin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const adminId = randomUUID();
  const targetId = randomUUID();
  const email = `delete-admin-${adminId}@example.test`;
  const targetEmail = `delete-target-${targetId}@example.test`;
  const password = "Local-test-only-5p!hR9#s";

  try {
    const { error } = await authAdmin.auth.admin.createUser({
      id: adminId,
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    const creada = await authAdmin.auth.admin.createUser({
      id: targetId,
      email: targetEmail,
      password,
      email_confirm: true,
    });
    if (creada.error) throw creada.error;
    await connection.db.insert(schema.advisors).values([
      { id: adminId, email, displayName: "Admin Borrado", role: "admin", status: "activa" },
      {
        id: targetId,
        email: targetEmail,
        displayName: "Cuenta Desechable",
        role: "asesor",
        status: "activa",
      },
    ]);

    await page.goto("/login?next=/app/cuentas");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/app\/cuentas$/);

    const fila = page.getByRole("row").filter({ hasText: "Cuenta Desechable" });
    // El selector ofrece los tres rangos, nombrados por funcion y sin genero.
    const selector = fila.getByRole("combobox");
    await expect(selector).toContainText("Asesoría");
    await expect(selector).toContainText("Supervisión");
    await expect(selector).toContainText("Administración");

    await fila.getByRole("button", { name: "Borrar" }).click();
    // Cada fila trae su propio <dialog>, asi que se acota al que esta abierto:
    // los cerrados siguen en el DOM y su texto coincidiria tambien.
    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByText("Esto no se puede deshacer")).toBeVisible();
    await expect(dialogo.getByText("sus prácticas y todas sus respuestas evaluadas")).toBeVisible();

    const confirmar = dialogo.getByRole("button", { name: "Borrar la cuenta" });
    await expect(confirmar).toBeDisabled();
    const campo = dialogo.getByLabel(`Escribe ${targetEmail} para confirmar`);
    await campo.fill("otra@example.test");
    await expect(confirmar).toBeDisabled();
    await campo.fill(targetEmail);
    await expect(confirmar).toBeEnabled();
    // La opacidad tiene una transicion de 100 ms: sin esperarla, una captura o
    // una medicion agarran el boton a medio camino y lo hacen ver deshabilitado
    // cuando ya no lo esta.
    await expect(confirmar).toHaveCSS("opacity", "1");
    await page.screenshot({ path: "test-results/borrar-cuenta.png" });
    await confirmar.click();

    // Si el borrado falla, el dialogo muestra el motivo: se lee antes de
    // afirmar cualquier cosa, para que el test diga la verdad y no "no se ve".
    const motivo = dialogo.getByRole("alert");
    if (await motivo.count()) console.info("motivo del fallo:", await motivo.textContent());
    await expect(dialogo).toBeHidden();
    await expect(page.getByRole("row").filter({ hasText: "Cuenta Desechable" })).toHaveCount(0);
    const [sigue] = await connection.db
      .select()
      .from(schema.advisors)
      .where(eq(schema.advisors.id, targetId));
    expect(sigue).toBeUndefined();
  } finally {
    await connection.db.delete(schema.advisors).where(eq(schema.advisors.id, targetId));
    await connection.db.delete(schema.advisors).where(eq(schema.advisors.id, adminId));
    await authAdmin.auth.admin.deleteUser(adminId).catch(() => undefined);
    await authAdmin.auth.admin.deleteUser(targetId).catch(() => undefined);
    await connection.close();
  }
});
