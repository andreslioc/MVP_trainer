import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";

import { loadEnv } from "../../src/lib/load-env.ts";

test("defaults to Express, consumes the stream and preserves the question on error", async ({
  page,
}) => {
  loadEnv();
  const [
    { openDirectDatabase },
    { advisors, liveSessions, products },
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
  const email = `copilot-e2e-${advisorId}@example.test`;
  const password = "Local-test-only-2w!mT8#q";
  const productName = `Producto Copilot ${productId}`;
  const question = "¿Cómo explico este producto a una clienta?";
  const express =
    "Contiene magnesio según la ficha verificada. Revisa la etiqueta para confirmar la porción.";
  let failNext = false;

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
      displayName: "Copilot E2E",
    });
    await connection.db.insert(products).values({
      id: productId,
      ...productInputSchema.parse(
        validProductInput({ name: productName, verifiedAt: new Date("2026-08-18T12:00:00Z") }),
      ),
    });
    await connection.db.insert(liveSessions).values({ id: sessionId, advisorId });

    await page.route("**/api/copilot", async (route) => {
      const body = route.request().postDataJSON() as { lengthVariant: string };
      expect(body.lengthVariant).toBe("express");
      if (failNext) {
        await route.fulfill({
          contentType: "application/x-ndjson",
          body: `${JSON.stringify({
            type: "error",
            result: {
              ok: false,
              error: { message: "El proveedor no respondió." },
            },
          })}\n`,
        });
        return;
      }
      const composition = {
        express,
        estandar: `${express} También puedes explicar su formato práctico.`,
        profunda: `${express} También puedes explicar su formato práctico y el contexto de uso.`,
        confidence: "alto",
        cta_used: "Consulta disponibilidad por WhatsApp",
        rule_applied: "canal_whatsapp",
      };
      await route.fulfill({
        contentType: "application/x-ndjson",
        body: [
          JSON.stringify({ type: "chunk", chunk: "Contiene magnesio " }),
          JSON.stringify({ type: "chunk", chunk: "según la ficha verificada." }),
          JSON.stringify({
            type: "complete",
            result: {
              ok: true,
              data: {
                composition,
                durations: { express: 15, estandar: 32, profunda: 61 },
              },
            },
          }),
          "",
        ].join("\n"),
      });
    });

    await page.goto("/login?next=/app/copilot");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/app\/copilot$/);

    await expect(page.getByRole("radio", { name: /Express/ })).toBeChecked();
    await expect(page.getByText("15–20 s")).toBeVisible();
    await page.getByLabel("Producto verificado").selectOption(productId);
    await page.getByLabel("Pregunta").fill(question);
    await page.getByRole("button", { name: "Generar respuesta" }).click();

    await expect(page.getByText(express)).toBeVisible();
    await expect(page.getByText("15 segundos")).toBeVisible();
    await expect(page.getByText("Confianza: alto")).toBeVisible();
    await expect(page.getByLabel("Pregunta")).toHaveValue(question);

    failNext = true;
    await page.getByRole("button", { name: "Regenerar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "No se pudo generar" })).toContainText(
      "El proveedor no respondió",
    );
    await expect(page.getByLabel("Pregunta")).toHaveValue(question);
  } finally {
    await connection.db.delete(liveSessions).where(eq(liveSessions.id, sessionId));
    await connection.db.delete(products).where(eq(products.id, productId));
    await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
    await authAdmin.auth.admin.deleteUser(advisorId);
    await connection.close();
  }
});
