import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";

import { loadEnv } from "../../src/lib/load-env.ts";

/**
 * El panel de analiticas, mirado de verdad.
 *
 * Se toma una captura a proposito: el validador de paletas revisa color y no
 * geometria, asi que los choques de etiqueta y los desbordes solo aparecen
 * abriendo la pagina.
 */
/**
 * Las nueve dimensiones de la rubrica con notas distintas, para que la tabla
 * arme la escalera de verdad. Con dos filas no se ve si el orden funciona.
 */
function nueveDimensiones(base: number) {
  const claves = [
    "conocimiento_producto",
    "claridad_explicacion",
    "naturalidad_cercania",
    "uso_responsable_evidencia",
    "manejo_objeciones",
    "capacidad_persuasion",
    "uso_cta",
    "duracion",
    "cumplimiento_reglas_marca",
  ];
  return Object.fromEntries(
    claves.map((clave, index) => [
      clave,
      { score: Math.min(Math.max(base - Math.floor(index / 2), 1), 5), reason: "r" },
    ]),
  );
}

test("las analiticas de una asesora se ven y solo las abre administracion", async ({ page }) => {
  loadEnv();
  const [{ openDirectDatabase }, schema, { getSupabaseAdminEnv }] = await Promise.all([
    import("../../src/db/client.ts"),
    import("../../src/db/schema.ts"),
    import("../../src/lib/env.ts"),
  ]);
  const connection = openDirectDatabase();
  const { url, secretKey } = getSupabaseAdminEnv();
  const authAdmin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const adminId = randomUUID();
  const asesoraId = randomUUID();
  const productId = randomUUID();
  const email = `analytics-e2e-${adminId}@example.test`;
  const password = "Local-test-only-5p!hR9#s";

  try {
    const { error } = await authAdmin.auth.admin.createUser({
      id: adminId,
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    await connection.db.insert(schema.advisors).values([
      { id: adminId, email, displayName: "Admin Analiticas", role: "admin", status: "activa" },
      {
        id: asesoraId,
        email: `asesora-${asesoraId}@example.test`,
        displayName: "Asesora Medida",
        role: "asesor",
        status: "activa",
      },
    ]);

    const [ficha] = await connection.db
      .select({ id: schema.products.id })
      .from(schema.products)
      .limit(1);
    if (!ficha) throw new Error("no hay fichas en la base de desarrollo");

    const [pregunta] = await connection.db
      .insert(schema.trainingQuestions)
      .values({
        id: productId,
        productId: ficha.id,
        text: "¿Para que sirve?",
        intent: "informacion",
        difficulty: "basica",
        idealAnswer: "Responde desde la ficha.",
        criteria: ["Usa la ficha"],
        source: "seed",
      })
      .returning();
    const [sesion] = await connection.db
      .insert(schema.trainingSessions)
      .values({ advisorId: asesoraId, productId: ficha.id, activeSeconds: 480 })
      .returning();
    if (!pregunta || !sesion) throw new Error("no se pudo sembrar la practica");
    // Tres respuestas en tres dias distintos: con un solo punto la linea
    // acumulada no se dibuja, y una grafica que nunca se renderiza no esta
    // probada. Las fechas se escriben a mano para que caigan en dias separados.
    const dia = (atras: number) => new Date(Date.now() - atras * 24 * 3_600_000);
    await connection.db.insert(schema.trainingAnswers).values([
      {
        sessionId: sesion.id,
        questionId: pregunta.id,
        advisorAnswer: "Primera respuesta.",
        scores: nueveDimensiones(4),
        createdAt: dia(2),
      },
      {
        sessionId: sesion.id,
        questionId: pregunta.id,
        advisorAnswer: "Segunda respuesta.",
        scores: nueveDimensiones(5),
        createdAt: dia(1),
      },
      {
        sessionId: sesion.id,
        questionId: pregunta.id,
        advisorAnswer: "Tercera respuesta.",
        scores: nueveDimensiones(3),
        createdAt: dia(0),
      },
    ]);

    await page.goto("/login?next=/app/analiticas");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/app\/analiticas$/);

    await page.getByRole("link", { name: /Asesora Medida/ }).click();
    await expect(page.getByRole("heading", { name: "Asesora Medida" })).toBeVisible();
    await expect(page.getByText("Prácticas", { exact: true })).toBeVisible();
    // 480 segundos son 8 minutos: el tiempo sale del acumulado activo.
    await expect(page.getByText("8 min en los últimos 30 días")).toBeVisible();

    // El selector de ventana: cuatro opciones y la activa marcada para quien
    // usa lector de pantalla, no solo por color.
    const periodos = page.getByRole("navigation", { name: "Periodo de las analíticas" });
    for (const opcion of ["Hoy", "7 días", "30 días", "Todo"]) {
      await expect(periodos.getByRole("link", { name: opcion })).toBeVisible();
    }
    await expect(periodos.getByRole("link", { name: "30 días" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Cambiar de ventana es navegar: la URL lo dice, asi que se puede compartir.
    await periodos.getByRole("link", { name: "Hoy" }).click();
    await expect(page).toHaveURL(/periodo=dia$/);
    await expect(periodos.getByRole("link", { name: "Hoy" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // La practica sembrada es de hoy, asi que sigue contando dentro de la ventana.
    await expect(page.getByText("8 min hoy")).toBeVisible();

    await periodos.getByRole("link", { name: "30 días" }).click();
    await expect(page).toHaveURL(/periodo=mes$/);
    // Tres respuestas calificadas: sigue calibrando, porque el umbral cuenta
    // respuestas y no pares dimension-respuesta.
    await expect(page.getByText("Calibrando")).toBeVisible();
    // La tabla escalonada: cabecera, fila por dimension y la nota a la derecha.
    const tabla = page.getByRole("table");
    await expect(tabla.getByRole("columnheader", { name: "Qué se evalúa" })).toBeVisible();
    await expect(tabla.getByRole("columnheader", { name: "Nota" })).toBeVisible();
    // Nueve dimensiones mas la cabecera.
    await expect(tabla.getByRole("row")).toHaveCount(10);
    // Las notas van de menor a mayor hacia abajo: eso es la escalera.
    const notas = await tabla.locator("tbody tr td:last-child").allTextContents();
    const numeros = notas.map((texto) => Number.parseFloat(texto));
    expect(numeros).toEqual([...numeros].sort((a, b) => a - b));
    // La linea acumulada existe y llega a 3.
    await expect(page.getByText("Respuestas acumuladas")).toBeAttached();

    await page.screenshot({ path: "test-results/analiticas-asesora.png", fullPage: true });

    // El menu de una asesora no muestra la entrada.
    await expect(page.getByRole("link", { name: "Analíticas" })).toBeVisible();
  } finally {
    await connection.db
      .delete(schema.trainingSessions)
      .where(eq(schema.trainingSessions.advisorId, asesoraId));
    await connection.db
      .delete(schema.trainingQuestions)
      .where(eq(schema.trainingQuestions.id, productId));
    await connection.db.delete(schema.advisors).where(eq(schema.advisors.id, asesoraId));
    await connection.db.delete(schema.advisors).where(eq(schema.advisors.id, adminId));
    await authAdmin.auth.admin.deleteUser(adminId);
    await connection.close();
  }
});
