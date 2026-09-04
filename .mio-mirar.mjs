import { chromium } from "@playwright/test";
const dir = "/tmp/claude-1000/-home-qubit-MVP-training/d13a19f9-a0b0-4b31-a617-0aa887d7ce9b/scratchpad";
const navegador = await chromium.launch();
for (const [nombre, esquema] of [["claro", "light"], ["oscuro", "dark"]]) {
  const ctx = await navegador.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: esquema,
  });
  const page = await ctx.newPage();
  const problemas = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problemas.push(`${m.type()}: ${m.text()}`);
  });
  await page.goto("http://localhost:3200/login", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${dir}/login-${nombre}.png`, fullPage: true });
  const fondo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  console.log(`login ${nombre}: fondo ${fondo}`, problemas.length ? problemas : "sin errores");
  await ctx.close();
}
await navegador.close();
