import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { loadEnv } from "../../src/lib/load-env.ts";

/**
 * Regresion: la practica anunciaba N preguntas y solo mostraba la primera, sin
 * forma de avanzar. El e2e anterior sembraba una sola pregunta, asi que el gate
 * pasaba con el defecto dentro. Esta prueba siembra tres a proposito.
 */
test("walks through every question of a practice batch", async ({ page }) => {
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
  const productId = randomUUID();
  const sessionId = randomUUID();
  const email = `navigation-e2e-${advisorId}@example.test`;
  const password = "Local-test-only-7r!kP4#v";
  const productName = `Producto navegacion ${productId}`;
  const texts = [
    `Primera pregunta ${productId.slice(0, 8)}`,
    `Segunda pregunta ${productId.slice(0, 8)}`,
    `Tercera pregunta ${productId.slice(0, 8)}`,
  ];

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
      displayName: "Navigation E2E",
      role: "asesor",
      status: "activa",
    });
    await connection.db.insert(products).values({
      id: productId,
      ...productInputSchema.parse(
        validProductInput({ name: productName, verifiedAt: new Date("2026-08-18T12:00:00Z") }),
      ),
    });
    await connection.db.insert(trainingQuestions).values(
      texts.map((text, index) => ({
        productId,
        text,
        intent: "informacion" as const,
        difficulty: index === 2 ? ("dificil" as const) : ("basica" as const),
        idealAnswer: "Responde solo con datos de la ficha.",
        criteria: ["Usa la ficha"],
        source: "seed" as const,
      })),
    );
    await connection.db.insert(trainingSessions).values({ id: sessionId, advisorId, productId });

    await page.goto(`/login?next=/app/training/${sessionId}`);
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(
      page.getByText("3 preguntas en esta práctica privada", { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: texts[0] })).toBeVisible();
    await expect(page.getByText("Pregunta 1 de 3")).toBeVisible();

    await page.getByRole("link", { name: "Siguiente pregunta →" }).first().click();
    await expect(page.getByRole("heading", { name: texts[1] })).toBeVisible();
    await expect(page.getByText("Pregunta 2 de 3")).toBeVisible();

    await page.getByRole("link", { name: "Siguiente pregunta →" }).first().click();
    await expect(page.getByRole("heading", { name: texts[2] })).toBeVisible();
    await expect(page.getByText("Pregunta 3 de 3")).toBeVisible();
    // En la ultima no hay a donde seguir.
    await expect(page.getByRole("link", { name: "Siguiente pregunta →" })).toHaveCount(0);

    await page.getByRole("link", { name: "← Pregunta anterior" }).click();
    await expect(page.getByRole("heading", { name: texts[1] })).toBeVisible();

    // El indice tambien se puede saltar directo, y un valor fuera de rango se acota.
    await page.goto(`/app/training/${sessionId}?q=99`);
    await expect(page.getByText("Pregunta 3 de 3")).toBeVisible();
  } finally {
    await connection.db.delete(trainingSessions).where(eq(trainingSessions.id, sessionId));
    await connection.db.delete(trainingQuestions).where(eq(trainingQuestions.productId, productId));
    await connection.db.delete(products).where(eq(products.id, productId));
    await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
    await authAdmin.auth.admin.deleteUser(advisorId);
    await connection.close();
  }
});
