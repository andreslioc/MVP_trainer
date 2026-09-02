import { expect, test } from "@playwright/test";

/**
 * Estas pruebas afirman el RESULTADO —que ve quien abre el enlace y como sale
 * del paso— y no por que camino llega. Es deliberado: el `proxy.ts` se ejecuta
 * en Vercel pero NO en el servidor local con Turbopack, asi que una prueba que
 * afirmara "lo intercepto el proxy" pasaria en local sin haber ejercido nada.
 */

test("un enlace sin nada que canjear lo dice y ofrece salida", async ({ page }) => {
  // Es la URL que producia el flujo roto: el token viajaba en el fragmento y al
  // servidor llegaba una peticion vacia.
  await page.goto("/auth/confirm");

  await expect(page.getByText("El enlace no es válido", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ir a inicio de sesión" })).toBeVisible();
});

test("un hash que ya no sirve dice qué hacer, no deja la pantalla en blanco", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=hash-que-nadie-emitio&type=invite");

  await expect(page.getByText("ya se usó o venció", { exact: false })).toBeVisible();
});

test("traduce el error que Supabase devuelve en el fragmento", async ({ page }) => {
  // Literalmente la URL que aparecio en el navegador cuando el flujo fallaba.
  await page.goto("/auth/confirm#error=access_denied&error_code=otp_expired");

  await expect(page.getByText("ya se usó o venció", { exact: false })).toBeVisible();
});

test("la pantalla para crear contraseña exige sesión", async ({ page }) => {
  await page.goto("/definir-contrasena");

  // Sin sesion se acaba en login, venga el rechazo del proxy —`?next=`, que es
  // lo que hace Vercel— o de la propia pagina —`?error=UNAUTHENTICATED`—. Las
  // dos son la misma respuesta: aqui no se entra sin sesion.
  await expect(page).toHaveURL(/\/login\?(next|error)=/);
  await expect(page.getByRole("heading", { name: "Inicia sesión" })).toBeVisible();
});
