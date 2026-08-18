import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { loadEnv } from "../../src/lib/load-env.ts";

test("shows insights of an analyzed recording and promotes one to training", async ({ page }) => {
  loadEnv();
  const [
    { openDirectDatabase },
    { advisors, insights, liveRecordings, products, trainingQuestions },
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
  const recordingId = randomUUID();
  const email = `intelligence-e2e-${advisorId}@example.test`;
  const password = "Local-test-only-5p!hR9#s";
  const productName = `Producto intelligence ${productId}`;
  const faqText = `preguntan por la dosis diaria ${recordingId.slice(0, 8)}`;
  const riskText = `afirmaron que cura una enfermedad ${recordingId.slice(0, 8)}`;

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
      displayName: "Intelligence E2E",
      role: "asesor",
      status: "activa",
    });
    await connection.db.insert(products).values({
      id: productId,
      ...productInputSchema.parse(
        validProductInput({
          name: productName,
          verifiedAt: new Date("2026-08-18T12:00:00Z"),
        }),
      ),
    });
    await connection.db.insert(liveRecordings).values({
      id: recordingId,
      advisorId,
      storagePath: `live-recordings/${recordingId}.mp4`,
      status: "analyzed",
      transcript: "[Speaker 0] contenido ya analizado",
      durationS: 5400,
      callbackToken: randomUUID(),
      expiresAt: new Date(Date.now() + 90 * 24 * 3_600_000),
    });
    await connection.db.insert(insights).values([
      { recordingId, type: "faq", text: faqText, productId, frequency: 5 },
      { recordingId, type: "riesgo_claim", text: riskText, productId, frequency: 1 },
    ]);

    await page.goto("/login?next=/app/intelligence");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/app\/intelligence$/);

    await expect(page.getByRole("heading", { name: "Live Intelligence" })).toBeVisible();
    await expect(page.getByText("Analizada")).toBeVisible();
    await expect(page.getByText(faqText)).toBeVisible();
    await expect(page.getByText(riskText)).toBeVisible();

    // Un riesgo de afirmacion no es material de practica: no ofrece promocion.
    const riskCard = page.locator("li").filter({ hasText: riskText });
    await expect(riskCard.getByRole("button", { name: "Promover a entrenamiento" })).toHaveCount(0);

    const faqCard = page.locator("li").filter({ hasText: faqText });
    await faqCard.getByRole("button", { name: "Promover a entrenamiento" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Hallazgo promovido a pregunta de entrenamiento.",
    );
    await expect(faqCard.getByText("Ya es pregunta de entrenamiento")).toBeVisible();

    const promoted = await connection.db
      .select({ source: trainingQuestions.source })
      .from(trainingQuestions)
      .where(eq(trainingQuestions.text, faqText));
    expect(promoted).toHaveLength(1);
    expect(promoted[0]?.source).toBe("live_insight");
  } finally {
    await connection.db.delete(trainingQuestions).where(eq(trainingQuestions.productId, productId));
    await connection.db.delete(insights).where(eq(insights.recordingId, recordingId));
    await connection.db.delete(liveRecordings).where(eq(liveRecordings.id, recordingId));
    await connection.db.delete(products).where(eq(products.id, productId));
    await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
    await authAdmin.auth.admin.deleteUser(advisorId);
    await connection.close();
  }
});
