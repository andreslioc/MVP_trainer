import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { loadEnv } from "../../src/lib/load-env.ts";

/**
 * Regresion: todo Live Intelligence existia en el servidor y era inalcanzable
 * desde la aplicacion — nada llamaba a la subida. El e2e anterior sembraba una
 * grabacion ya analizada directamente en la base, asi que nunca toco la entrada.
 */
test("loads a live from a pasted transcript and leaves it ready to analyze", async ({ page }) => {
  loadEnv();
  const [{ openDirectDatabase }, { advisors, liveRecordings }, { getSupabaseAdminEnv }] =
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
  const email = `intake-e2e-${advisorId}@example.test`;
  const password = "Local-test-only-5p!hR9#s";
  const transcript = `[Speaker 0] Hola a todas, hoy hablamos de la creatina monohidratada ${advisorId.slice(0, 8)} y de como tomarla.`;

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
      displayName: "Intake E2E",
      role: "asesor",
      status: "activa",
    });

    await page.goto("/login?next=/app/intelligence");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/app\/intelligence$/);

    await expect(page.getByRole("heading", { name: "Cargar un live" })).toBeVisible();
    await expect(page.getByText("Todavía no has subido ninguna grabación.")).toBeVisible();

    await page.getByLabel("Transcripción del live").fill(transcript);
    await page.getByRole("button", { name: "Cargar transcripción" }).click();

    await expect(page.getByRole("status")).toContainText("Transcripción cargada");
    await expect(page.getByText("Lista para analizar")).toBeVisible();
    await expect(page.getByRole("button", { name: "Analizar grabación" })).toBeVisible();

    const stored = await connection.db
      .select({ status: liveRecordings.status, transcript: liveRecordings.transcript })
      .from(liveRecordings)
      .where(eq(liveRecordings.advisorId, advisorId));
    expect(stored).toHaveLength(1);
    expect(stored[0]?.status).toBe("transcribed");
    expect(stored[0]?.transcript).toBe(transcript);

    // La otra via existe y avisa cuando el proveedor no puede devolver el callback.
    await page.getByRole("tab", { name: "Subir audio o video" }).click();
    await expect(page.getByLabel("Grabación descargada del live")).toBeVisible();
  } finally {
    await connection.db.delete(liveRecordings).where(eq(liveRecordings.advisorId, advisorId));
    await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
    await authAdmin.auth.admin.deleteUser(advisorId);
    await connection.close();
  }
});
