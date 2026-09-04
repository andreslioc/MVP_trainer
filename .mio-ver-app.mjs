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
const email = `ver-${id}@example.test`;
const password = `Ver-solo-local-${id.slice(0, 8)}!x`;
try {
  const { error } = await admin.auth.admin.createUser({ id, email, password, email_confirm: true });
  if (error) throw error;
  await cx.db.insert(schema.advisors).values({ id, email, displayName: "Vista Oscura", role: "admin" });

  const navegador = await chromium.launch();
  for (const [nombre, esquema] of [["claro", "light"], ["oscuro", "dark"]]) {
    const ctx = await navegador.newContext({ viewport: { width: 1280, height: 1000 }, colorScheme: esquema });
    const page = await ctx.newPage();
    const problemas = [];
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") problemas.push(`${m.type()}: ${m.text()}`);
    });
    await page.goto("http://localhost:3200/login?next=/app");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    try {
      await page.waitForURL((u) => new URL(u).pathname.startsWith("/app"), { timeout: 20000 });
    } catch {
      console.log("no entro. url:", page.url());
      console.log("texto:", (await page.locator("body").innerText()).slice(0, 400));
      throw new Error("login fallo");
    }
    for (const [ruta, archivo] of [["/app/copilot", "copilot"], ["/app/intelligence", "intelligence"]]) {
      await page.goto(`http://localhost:3200${ruta}`, { waitUntil: "networkidle" });
      await page.screenshot({ path: `${dir}/${archivo}-${nombre}.png` });
    }
    console.log(`${nombre}:`, problemas.length ? problemas.slice(0, 5) : "sin errores de consola");
    await ctx.close();
  }
  await navegador.close();
} finally {
  await cx.db.delete(schema.advisors).where(eq(schema.advisors.id, id));
  await admin.auth.admin.deleteUser(id);
  await cx.close();
}
