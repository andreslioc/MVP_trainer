import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { loadEnv } from "../../src/lib/load-env.ts";

/**
 * La practica es lineal y la pregunta NO se elige.
 *
 * Regresion doble. La primera: la practica anunciaba N preguntas y solo mostraba
 * la primera, sin forma de avanzar. La segunda: la asesora escogia la pregunta
 * desde un `?q=` en la URL y podia saltarse las dificiles, y salir de la
 * practica la perdia —ninguna sesion se podia retomar y el consolidado no
 * existia. Esta prueba siembra respuestas ya evaluadas para comprobar las tres
 * cosas sin llamar al modelo: retomar cae en la primera pendiente, la tanda
 * completa manda al resumen, y el resumen promedia lo respondido.
 */
test("resumes a practice at the first pending question and consolidates at the end", async ({
  page,
}) => {
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
  const sessionId = randomUUID();
  const email = `navigation-e2e-${advisorId}@example.test`;
  const password = "Local-test-only-7r!kP4#v";
  const productName = `Producto navegacion ${productId}`;
  const texts = [
    `Primera pregunta ${productId.slice(0, 8)}`,
    `Segunda pregunta ${productId.slice(0, 8)}`,
    `Tercera pregunta ${productId.slice(0, 8)}`,
  ];
  const scores = (value: number) =>
    Object.fromEntries(
      evaluationDimensionKeys.map((key) => [key, { score: value, reason: `Nota de ${key}` }]),
    );

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
    const preguntas = await connection.db
      .insert(trainingQuestions)
      .values(
        texts.map((text, index) => ({
          productId,
          text,
          intent: "informacion" as const,
          difficulty: index === 2 ? ("dificil" as const) : ("basica" as const),
          idealAnswer: "Responde solo con datos de la ficha.",
          criteria: ["Usa la ficha"],
          source: "seed" as const,
        })),
      )
      .returning({ id: trainingQuestions.id, text: trainingQuestions.text });
    const idDe = (text: string) => {
      const found = preguntas.find((pregunta) => pregunta.text === text);
      if (!found) throw new Error(`No se sembro la pregunta ${text}`);
      return found.id;
    };
    await connection.db
      .insert(trainingSessions)
      .values({ id: sessionId, advisorId, productId, practiceSize: 3 });
    // La primera ya esta contestada y evaluada: retomar tiene que caer en la segunda.
    await connection.db.insert(trainingAnswers).values({
      sessionId,
      questionId: idDe(texts[0] ?? ""),
      advisorAnswer: "Lo que respondi en la primera.",
      scores: scores(4),
      feedback: "Bien encaminada.",
      improvedAnswer: "Version mejorada de la primera.",
    });

    await page.goto(`/login?next=/app/training`);
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();

    // El indice de Training ofrece retomarla en vez de dejarla perdida.
    await expect(page.getByRole("heading", { name: "Tienes práctica sin terminar" })).toBeVisible();
    await page.getByRole("link", { name: "Terminar práctica" }).first().click();

    // Cae en la primera PENDIENTE, no en la primera de la tanda.
    await expect(page.getByText("Pregunta 2 de 3")).toBeVisible();
    await expect(page.getByRole("heading", { name: texts[1] })).toBeVisible();
    await expect(page.getByText("1 respondidas", { exact: false })).toBeVisible();
    // Ya no hay forma de escoger la pregunta ni de saltar a otra.
    await expect(page.getByRole("link", { name: "← Pregunta anterior" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Siguiente pregunta →" })).toHaveCount(0);

    // Con la tanda completa, la sesion ya no es una pregunta: es el consolidado.
    await connection.db.insert(trainingAnswers).values(
      [texts[1] ?? "", texts[2] ?? ""].map((text, index) => ({
        sessionId,
        questionId: idDe(text),
        advisorAnswer: `Lo que respondi en la ${index + 2}.`,
        scores: scores(index === 0 ? 2 : 3),
        feedback: "Feedback sembrado.",
        improvedAnswer: "Version mejorada sembrada.",
      })),
    );
    await page.goto(`/app/training/${sessionId}`);
    await expect(page).toHaveURL(new RegExp(`/app/training/${sessionId}/resumen$`));
    await expect(page.getByRole("heading", { name: `Cómo te fue: ${productName}` })).toBeVisible();
    // (4 + 2 + 3) / 3 = 3
    await expect(page.getByText("3/5", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("3 de 3 preguntas evaluadas", { exact: false })).toBeVisible();
  } finally {
    await connection.db.delete(trainingSessions).where(eq(trainingSessions.id, sessionId));
    await connection.db.delete(trainingQuestions).where(eq(trainingQuestions.productId, productId));
    await connection.db.delete(products).where(eq(products.id, productId));
    await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
    await authAdmin.auth.admin.deleteUser(advisorId);
    await connection.close();
  }
});
