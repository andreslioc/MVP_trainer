import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";

import { loadEnv } from "../../src/lib/load-env.ts";

test("selects a verified product, shows states and opens a private session", async ({ page }) => {
  loadEnv();
  const [
    { openDirectDatabase },
    { advisors, products, trainingQuestions, trainingSessions },
    { getSupabaseAdminEnv },
    { productInputSchema },
    { validProductInput },
  ] = await Promise.all([
    import("../../src/db/client.ts"),
    import("../../src/db/schema.ts"),
    import("../../src/lib/env.ts"),
    import("../../src/lib/validation/product.ts"),
    import("../fixtures/product.ts"),
  ]);
  const connection = openDirectDatabase();
  const { url, secretKey } = getSupabaseAdminEnv();
  const authAdmin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const advisorId = randomUUID();
  const readyProductId = randomUUID();
  const emptyProductId = randomUUID();
  const email = `training-e2e-${advisorId}@example.test`;
  const password = "Local-test-only-5p!hR9#s";
  const readyName = `Producto listo ${readyProductId}`;
  const emptyName = `Producto vacío ${emptyProductId}`;
  const questionText = "¿Cómo explico el contenido verificado?";

  try {
    const { error } = await authAdmin.auth.admin.createUser({
      id: advisorId,
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    await connection.db.insert(advisors).values({
      id: advisorId,
      email,
      displayName: "Training E2E",
      role: "asesor",
      status: "activa",
    });
    await connection.db.insert(products).values([
      {
        id: readyProductId,
        ...productInputSchema.parse(
          validProductInput({ name: readyName, verifiedAt: new Date("2026-08-18T12:00:00Z") }),
        ),
      },
      {
        id: emptyProductId,
        ...productInputSchema.parse(
          validProductInput({ name: emptyName, verifiedAt: new Date("2026-08-18T12:00:00Z") }),
        ),
      },
    ]);
    await connection.db.insert(trainingQuestions).values({
      productId: readyProductId,
      text: questionText,
      intent: "informacion",
      difficulty: "basica",
      idealAnswer: "Explica únicamente lo registrado en la ficha.",
      criteria: ["Usa la ficha"],
      source: "seed",
    });

    await page.goto("/login?next=/app/training");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/app\/training$/);
    await expect(page.getByLabel("Producto verificado")).toBeVisible();
    await expect(page.getByRole("button", { name: "Comenzar práctica" })).toBeDisabled();

    await page.getByLabel("Producto verificado").selectOption(emptyProductId);
    await expect(page.getByText("Este producto todavía no tiene preguntas.")).toBeVisible();

    await page.getByLabel("Producto verificado").selectOption(readyProductId);
    await expect(page.getByText("1 pregunta disponible.")).toBeVisible();

    await page.route("**/app/training", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      await route.continue();
    });
    await page.getByRole("button", { name: "Comenzar práctica" }).click();
    await expect(page.getByRole("button", { name: "Abriendo práctica…" })).toBeVisible();
    await expect(page).toHaveURL(/\/app\/training\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: readyName })).toBeVisible();
    await expect(page.getByRole("heading", { name: questionText })).toBeVisible();
  } finally {
    await connection.db.delete(trainingSessions).where(eq(trainingSessions.advisorId, advisorId));
    await connection.db
      .delete(trainingQuestions)
      .where(eq(trainingQuestions.productId, readyProductId));
    await connection.db.delete(products).where(eq(products.id, readyProductId));
    await connection.db.delete(products).where(eq(products.id, emptyProductId));
    await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
    await authAdmin.auth.admin.deleteUser(advisorId);
    await connection.close();
  }
});
