import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";

import { loadEnv } from "../../src/lib/load-env.ts";

test("shows the private question form, nine scores and improved answer", async ({ page }) => {
  loadEnv();
  const [
    { openDirectDatabase },
    { advisors, products, trainingAnswers, trainingQuestions, trainingSessions },
    { evaluationDimensionKeys },
    { getSupabaseAdminEnv },
    { productInputSchema },
    { validProductInput },
  ] = await Promise.all([
    import("../../src/db/client.ts"),
    import("../../src/db/schema.ts"),
    import("../../src/lib/ai/schemas.ts"),
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
  const questionId = randomUUID();
  const sessionId = randomUUID();
  const email = `evaluation-e2e-${advisorId}@example.test`;
  const password = "Local-test-only-7r!kP4#v";
  const productName = `Producto evaluación ${productId}`;
  const questionText = "¿Cómo explicarías este producto durante un live?";
  const improvedAnswer = "Contiene magnesio; confirma la cantidad exacta en la etiqueta.";

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
      displayName: "Evaluation E2E",
    });
    await connection.db.insert(products).values({
      id: productId,
      ...productInputSchema.parse(
        validProductInput({ name: productName, verifiedAt: new Date("2026-08-18T12:00:00Z") }),
      ),
    });
    await connection.db.insert(trainingQuestions).values({
      id: questionId,
      productId,
      text: questionText,
      intent: "informacion",
      difficulty: "basica",
      idealAnswer: improvedAnswer,
      criteria: ["Usa solo la ficha"],
      source: "seed",
    });
    await connection.db.insert(trainingSessions).values({ id: sessionId, advisorId, productId });
    await connection.db.insert(trainingAnswers).values({
      sessionId,
      questionId,
      advisorAnswer: "Diría que contiene magnesio y revisaría su etiqueta.",
      scores: Object.fromEntries(
        evaluationDimensionKeys.map((key) => [key, { score: 4, reason: `Motivo ${key}` }]),
      ),
      feedback: "La respuesta es responsable y puede ser más concreta.",
      improvedAnswer,
    });

    await page.goto(`/login?next=/app/training/${sessionId}`);
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(new RegExp(`/app/training/${sessionId}$`));
    await expect(page.getByRole("heading", { name: productName })).toBeVisible();
    await expect(page.getByRole("heading", { name: questionText })).toBeVisible();
    await expect(page.getByLabel("Tu respuesta como si estuvieras en vivo")).toHaveValue(
      "Diría que contiene magnesio y revisaría su etiqueta.",
    );
    await expect(page.getByRole("heading", { name: "Tus nueve dimensiones" })).toBeVisible();
    await expect(page.locator("text=4/5")).toHaveCount(9);
    await expect(page.getByRole("heading", { name: "Versión mejorada" })).toBeVisible();
    await expect(page.getByText(improvedAnswer)).toBeVisible();
  } finally {
    await connection.db.delete(trainingSessions).where(eq(trainingSessions.id, sessionId));
    await connection.db.delete(trainingQuestions).where(eq(trainingQuestions.id, questionId));
    await connection.db.delete(products).where(eq(products.id, productId));
    await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
    await authAdmin.auth.admin.deleteUser(advisorId);
    await connection.close();
  }
});
