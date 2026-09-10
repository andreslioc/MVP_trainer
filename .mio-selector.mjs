import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { loadEnv } from "./src/lib/load-env.ts";
loadEnv();
const { openDirectDatabase } = await import("./src/db/client.ts");
const schema = await import("./src/db/schema.ts");
const { getSupabaseAdminEnv } = await import("./src/lib/env.ts");
const dir = "/tmp/claude-1000/-home-qubit-MVP-training/d13a19f9-a0b0-4b31-a617-0aa887d7ce9b/scratchpad";
const cx = openDirectDatabase();
const { url, secretKey } = getSupabaseAdminEnv();
const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const id = randomUUID();
const email = `sel-${id}@example.test`;
const password = `Sel-solo-local-${id.slice(0, 8)}!x`;
try {
  const { error } = await admin.auth.admin.createUser({ id, email, password, email_confirm: true });
  if (error) throw error;
  await cx.db.insert(schema.advisors).values({ id, email, displayName: "Vista Selector", role: "admin" });
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3200/login?next=/app");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => new URL(u).pathname.startsWith("/app"), { timeout: 20000 });
  await page.goto("http://localhost:3200/app/copilot", { waitUntil: "networkidle" });
  const opciones = await page.locator("select#productId, select[name=productId]").first()
    .locator("option").allTextContents().catch(() => []);
  const todas = opciones.length ? opciones : await page.locator("select").first().locator("option").allTextContents();
  console.log("OPCIONES DEL SELECTOR DEL COPILOT (primeras 12):");
  for (const o of todas.filter((t) => /orégano|MultiGummies|Cabello|Colágeno|CALM/i.test(t)).slice(0, 12)) console.log("  " + o);
  await page.screenshot({ path: `${dir}/selector-copilot.png` });
  await ctx.close();
  await nav.close();
} finally {
  await cx.db.delete(schema.advisors).where(eq(schema.advisors.id, id));
  await admin.auth.admin.deleteUser(id);
  await cx.close();
}
