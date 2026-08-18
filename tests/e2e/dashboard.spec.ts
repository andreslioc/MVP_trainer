import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { loadEnv } from "../../src/lib/load-env.ts";

test("dashboard scopes metrics to the signed-in advisor", async ({ page }) => {
  loadEnv();
  const [{ openDirectDatabase }, { advisors, liveSessions }, { getSupabaseAdminEnv }] =
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

  const advisorId = randomUUID();
  const strangerId = randomUUID();
  const email = `dashboard-e2e-${advisorId}@example.test`;
  const password = "Local-test-only-5p!hR9#s";

  try {
    const { error } = await authAdmin.auth.admin.createUser({
      id: advisorId,
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    await connection.db.insert(advisors).values([
      {
        id: advisorId,
        email,
        displayName: "Dashboard E2E",
        role: "asesor",
        status: "activa",
      },
      {
        id: strangerId,
        email: `stranger-${strangerId}@example.test`,
        displayName: "Ajena",
        role: "asesor",
        status: "activa",
      },
    ]);
    // Un live propio y tres ajenos: el dashboard debe mostrar 1, no 4.
    await connection.db
      .insert(liveSessions)
      .values([
        { advisorId },
        { advisorId: strangerId },
        { advisorId: strangerId },
        { advisorId: strangerId },
      ]);

    await page.goto("/login?next=/app");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/app$/);

    await expect(page.getByRole("heading", { name: "Tu centro de trabajo" })).toBeVisible();
    await expect(page.getByText("Solo tus números", { exact: false })).toBeVisible();

    const liveCard = page.locator("a").filter({ hasText: "Lives asistidos" });
    await expect(liveCard).toContainText("1");

    // El costo de IA es dato de organizacion: una asesora no lo ve.
    await expect(page.getByText("Costo de IA acumulado")).toHaveCount(0);
  } finally {
    await connection.db.delete(liveSessions).where(eq(liveSessions.advisorId, advisorId));
    await connection.db.delete(liveSessions).where(eq(liveSessions.advisorId, strangerId));
    await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
    await connection.db.delete(advisors).where(eq(advisors.id, strangerId));
    await authAdmin.auth.admin.deleteUser(advisorId);
    await connection.close();
  }
});
