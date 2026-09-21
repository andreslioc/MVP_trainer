import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";

import { loadEnv } from "../../src/lib/load-env.ts";

test("an admin assigns a weekly goal and sees its discriminated progress", async ({ page }) => {
  loadEnv();
  const [{ openDirectDatabase }, { advisors }, { getSupabaseAdminEnv }] = await Promise.all([
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
  const advisorId = randomUUID();
  const email = `weekly-admin-${adminId}@example.test`;
  const password = "Local-test-only-7m!tQ4#v";

  try {
    const { error } = await authAdmin.auth.admin.createUser({
      id: adminId,
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    await connection.db.insert(advisors).values([
      { id: adminId, email, displayName: "Admin metas E2E", role: "admin" },
      {
        id: advisorId,
        email: `weekly-advisor-${advisorId}@example.test`,
        displayName: "Asesora meta E2E",
        role: "asesor",
      },
    ]);

    await page.goto("/login?next=/app/metas-semanales");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/app\/metas-semanales$/);
    await expect(page.getByRole("heading", { name: "Metas semanales" })).toBeVisible();

    await page.getByLabel("Asignar a").selectOption(advisorId);
    await page.getByLabel("Sesiones de Training").fill("4");
    await page.getByLabel("Minutos de Pre-training").fill("90");
    await page.getByLabel("Fichas distintas").fill("5");
    await page.getByRole("button", { name: "Guardar meta semanal" }).click();

    await expect(page.getByRole("status")).toContainText("Meta guardada para 1 asesora");
    const advisorCard = page.locator("div.rounded-card").filter({ hasText: "Asesora meta E2E" });
    await expect(advisorCard).toContainText("Sin iniciar");
    await expect(advisorCard).toContainText("0 de 4 sesiones");
    await expect(advisorCard).toContainText("0 de 90 min");
    await expect(advisorCard).toContainText("0 de 5 fichas");
  } finally {
    await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
    await connection.db.delete(advisors).where(eq(advisors.id, adminId));
    await authAdmin.auth.admin.deleteUser(adminId);
    await connection.close();
  }
});
