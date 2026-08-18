import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";

import { loadEnv } from "../../src/lib/load-env.ts";

test("an admin updates a threshold and deactivates the live promotion", async ({ page }) => {
  loadEnv();
  const [{ openDirectDatabase }, { advisors, commercialRules }, { getSupabaseAdminEnv }] =
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
  const email = `brain-admin-${id}@example.test`;
  const password = "Local-test-only-8h!qL2#f";
  const originalRules = await connection.db
    .select()
    .from(commercialRules)
    .where(eq(commercialRules.key, "envio_gratis"));
  const originalPromo = await connection.db
    .select()
    .from(commercialRules)
    .where(eq(commercialRules.key, "promo_live"));

  try {
    await connection.db
      .insert(commercialRules)
      .values([
        { key: "envio_gratis", value: { threshold_cop: 100000 }, active: true },
        { key: "promo_live", value: { message: "Promoción temporal" }, active: true },
      ])
      .onConflictDoNothing();
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
      displayName: "Business Admin",
      role: "admin",
      status: "activa",
    });

    await page.goto("/login?next=/app/settings");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/app\/settings$/);

    const shippingRule = page.locator("form").filter({ hasText: "Envío gratuito" });
    await shippingRule.getByLabel("Umbral en COP").fill("146321");
    await shippingRule.getByRole("button", { name: "Guardar regla" }).click();
    await expect(shippingRule.getByRole("status")).toContainText("Regla guardada");

    await page.reload();
    await expect(
      page.locator("form").filter({ hasText: "Envío gratuito" }).getByLabel("Umbral en COP"),
    ).toHaveValue("146321");

    const promoRule = page.locator("form").filter({ hasText: "Promoción del live" });
    await promoRule.getByLabel("Disponible para composición").uncheck();
    await promoRule.getByRole("button", { name: "Guardar regla" }).click();
    await expect(promoRule.getByText("Inactiva", { exact: true })).toBeVisible();
  } finally {
    for (const [key, rows] of [
      ["envio_gratis", originalRules],
      ["promo_live", originalPromo],
    ] as const) {
      const original = rows[0];
      if (original) {
        await connection.db
          .update(commercialRules)
          .set({ value: original.value, active: original.active, updatedAt: original.updatedAt })
          .where(eq(commercialRules.key, key));
      } else {
        await connection.db.delete(commercialRules).where(eq(commercialRules.key, key));
      }
    }
    await connection.db.delete(advisors).where(eq(advisors.id, id));
    await authAdmin.auth.admin.deleteUser(id);
    await connection.close();
  }
});
