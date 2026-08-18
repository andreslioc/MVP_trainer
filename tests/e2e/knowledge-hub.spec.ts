import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";

import { loadEnv } from "../../src/lib/load-env.ts";

test("an admin creates, edits and deletes a complete product card", async ({ page }) => {
  loadEnv();
  const [{ openDirectDatabase }, { advisors, products }, { getSupabaseAdminEnv }] =
    await Promise.all([
      import("../../src/db/client.ts"),
      import("../../src/db/schema.ts"),
      import("../../src/lib/env.ts"),
    ]);
  const connection = openDirectDatabase();
  const { url, secretKey } = getSupabaseAdminEnv();
  const authAdmin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const id = randomUUID();
  const email = `knowledge-admin-${id}@example.test`;
  const password = "Local-test-only-4m!jP7#v";
  const brand = `E2E Brand ${id}`;
  const originalName = "Producto E2E completo";
  const updatedName = "Producto E2E actualizado";

  try {
    const { error } = await authAdmin.auth.admin.createUser({
      id,
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    await connection.db.insert(advisors).values({
      id,
      email,
      displayName: "Knowledge Admin",
      role: "admin",
      status: "activa",
    });

    await page.goto("/login?next=/app/knowledge");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/app\/knowledge$/);

    await page
      .getByRole("link", { name: /Nueva ficha|Crear la primera ficha/ })
      .first()
      .click();
    await page.getByLabel("Nombre comercial").fill(originalName);
    await page.getByLabel("Marca").fill(brand);
    await page.getByLabel("Categoría").fill("Minerales");
    await page.getByLabel("Presentación").fill("Frasco 60 cápsulas");
    await page.getByLabel("Formato").fill("Cápsula");
    for (let index = 0; index < 3; index += 1) {
      await page
        .getByLabel("Beneficio", { exact: true })
        .nth(index)
        .fill(`Beneficio ${index + 1}`);
      await page
        .getByLabel("Nota científica o fundamento", { exact: true })
        .nth(index)
        .fill(`Fundamento verificable ${index + 1}`);
    }
    await page.getByLabel("Precauciones").fill("Consulta a un profesional si usas medicamentos.");
    await page.getByRole("button", { name: "Crear ficha" }).click();

    await expect(page).toHaveURL(/\/app\/knowledge$/);
    let card = page.getByRole("article", { name: originalName });
    await expect(card).toBeVisible();
    await expect(card.getByText("Por verificar")).toBeVisible();

    await card.getByRole("link", { name: "Editar ficha" }).click();
    await page.getByLabel("Nombre comercial").fill(updatedName);
    await page.getByLabel("Ficha revisada por una persona").check();
    await page.getByRole("button", { name: "Guardar cambios" }).click();

    await expect(page).toHaveURL(/\/app\/knowledge$/);
    card = page.getByRole("article", { name: updatedName });
    await expect(card.getByText("Verificada", { exact: true })).toBeVisible();

    await card.getByRole("link", { name: "Editar ficha" }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Eliminar ficha" }).click();
    await expect(page).toHaveURL(/\/app\/knowledge$/);
    await expect(page.getByRole("article", { name: updatedName })).toHaveCount(0);
  } finally {
    await connection.db.delete(products).where(eq(products.brand, brand));
    await connection.db.delete(advisors).where(eq(advisors.id, id));
    await authAdmin.auth.admin.deleteUser(id);
    await connection.close();
  }
});
