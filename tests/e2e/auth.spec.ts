import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";

import { loadEnv } from "../../src/lib/load-env.ts";

test("redirects an unauthenticated app request to login with its destination", async ({ page }) => {
  await page.goto("/app");

  await expect(page).toHaveURL(/\/login\?next=(?:%2F|\/)app$/);
  await expect(page.getByRole("heading", { name: "Inicia sesión" })).toBeVisible();
  await expect(page.getByText("El acceso es solo por invitación")).toBeVisible();
});

test("does not expose public registration", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  await expect(page.getByText(/registr|crear cuenta/i)).toHaveCount(0);
});

test("signs out valid credentials for an inactive advisor", async ({ page }) => {
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
  const email = `inactive-e2e-${id}@example.test`;
  const password = "Local-test-only-9v!pR4#x";

  try {
    const { error } = await adminClient.auth.admin.createUser({
      id,
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    await connection.db.insert(advisors).values({
      id,
      email,
      displayName: "Inactive E2E",
      status: "inactiva",
    });

    await page.goto("/login?next=/app");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/login\?error=FORBIDDEN$/);
    await expect(page.getByText("Tu cuenta no está activa.", { exact: false })).toBeVisible();
    await expect(page.getByText("La sesión está activa y verificada")).toHaveCount(0);
  } finally {
    await connection.db.delete(advisors).where(eq(advisors.id, id));
    await adminClient.auth.admin.deleteUser(id);
    await connection.close();
  }
});
