import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";

import { loadEnv } from "../../src/lib/load-env.ts";

type TestRole = "asesor" | "admin";

async function createActiveAdvisor(role: TestRole) {
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
  const email = `${role}-shell-${id}@example.test`;
  const password = "Local-test-only-3n!kW8#c";
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
    displayName: role === "admin" ? "Admin Shell" : "Advisor Shell",
    role,
    status: "activa",
  });

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

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login?next=/app");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test("shows the advisor navigation and collapses it below 768px", async ({ page }) => {
  const advisor = await createActiveAdvisor("asesor");
  try {
    await signIn(page, advisor.email, advisor.password);
    const desktopNavigation = page.getByRole("navigation", { name: "Navegación principal" });
    for (const label of ["Training", "Copilot", "Intelligence", "Knowledge"]) {
      await expect(desktopNavigation.getByRole("link", { name: new RegExp(label) })).toBeVisible();
    }
    await expect(desktopNavigation.getByRole("link", { name: /Settings/ })).toHaveCount(0);

    await page.setViewportSize({ width: 767, height: 900 });
    await expect(desktopNavigation).toBeHidden();
    const mobileMenu = page.locator("details");
    await expect(mobileMenu).toBeVisible();
    await mobileMenu.locator("summary").click();
    await expect(mobileMenu).toHaveAttribute("open", "");
    await expect(page.getByRole("navigation", { name: "Navegación móvil" })).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  } finally {
    await advisor.cleanup();
  }
});

test("cierra el menu movil al entrar a un modulo", async ({ page }) => {
  // Caso real a 320 px: el layout no se remonta al navegar, asi que el panel
  // del `details` seguia abierto sobre la pagina nueva y tapaba el titulo, el
  // selector de ficha y el primer campo del Copilot.
  const advisor = await createActiveAdvisor("asesor");
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, advisor.email, advisor.password);
    const mobileMenu = page.locator("details");
    await mobileMenu.locator("summary").click();
    await expect(mobileMenu).toHaveAttribute("open", "");

    await page
      .getByRole("navigation", { name: "Navegación móvil" })
      .getByRole("link", { name: /Copilot/ })
      .click();
    await expect(page).toHaveURL(/\/app\/copilot$/);
    await expect(mobileMenu).not.toHaveAttribute("open", "");
  } finally {
    await advisor.cleanup();
  }
});

test("shows Settings to an admin", async ({ page }) => {
  const admin = await createActiveAdvisor("admin");
  try {
    await signIn(page, admin.email, admin.password);
    await expect(
      page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("link", { name: /Settings/ }),
    ).toBeVisible();
  } finally {
    await admin.cleanup();
  }
});
