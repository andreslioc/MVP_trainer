import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import {
  advisors,
  products,
  trainingAnswers,
  trainingQuestions,
  trainingSessions,
} from "../../src/db/schema.ts";
import { type AdvisorRole, hasRole } from "../../src/lib/roles.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import {
  getAdvisorPracticeSummary,
  listAdvisorPractices,
  listReviewableAdvisors,
} from "../../src/server/training/practice-review.ts";
import { validProductInput } from "../fixtures/product.ts";

/**
 * La revision de practicas por parte de quien acompaña.
 *
 * Lo que estas pruebas cuidan es el LIMITE: es la unica lectura de Training que
 * autoriza por rango en vez de por propiedad, asi que si el rango se relaja o
 * el filtro de dueño se cae, una asesora podria leer las respuestas de otra.
 * Los dobles respetan el rol pedido igual que `requireRole`: uno que diga si a
 * todo no probaria nada.
 */

const connection = openDirectDatabase("test");
const asesoraId = randomUUID();
const otraAsesoraId = randomUUID();
const supervisorId = randomUUID();
const productId = randomUUID();

const como = (id: string, role: AdvisorRole) => async (required: AdvisorRole) =>
  hasRole(role, required)
    ? { ok: true as const, data: { id, role } }
    : { ok: false as const, error: { code: "FORBIDDEN", message: "Sin permiso." } };

const comoSupervision = como(supervisorId, "supervisor");
const comoAsesora = como(asesoraId, "asesor");

const nota = (score: number) => ({
  conocimiento_producto: { score, reason: "r" },
  uso_cta: { score, reason: "r" },
});

let sessionId = "";
let sessionAjenaId = "";
let questionId = "";

beforeAll(async () => {
  await connection.db.insert(advisors).values([
    { id: asesoraId, email: `${asesoraId}@test.co`, displayName: "Asesora Revisada" },
    { id: otraAsesoraId, email: `${otraAsesoraId}@test.co`, displayName: "Asesora Ajena" },
    {
      id: supervisorId,
      email: `${supervisorId}@test.co`,
      displayName: "Supervision de prueba",
      role: "supervisor",
    },
  ]);
  const parsed = productInputSchema.parse(validProductInput());
  await connection.db.insert(products).values({ ...parsed, id: productId, verifiedAt: new Date() });

  const [pregunta] = await connection.db
    .insert(trainingQuestions)
    .values({
      productId,
      text: "¿Sirve para bajar de peso?",
      intent: "objecion",
      difficulty: "basica",
      idealAnswer: "Responde desde la ficha.",
      criteria: ["Usa la ficha"],
      source: "seed",
    })
    .returning();
  if (!pregunta) throw new Error("no se creo la pregunta");
  questionId = pregunta.id;

  const [sesion] = await connection.db
    .insert(trainingSessions)
    .values({ advisorId: asesoraId, productId, practiceSize: 1, activeSeconds: 120 })
    .returning();
  if (!sesion) throw new Error("no se creo la sesion");
  sessionId = sesion.id;
  await connection.db.insert(trainingAnswers).values({
    sessionId,
    questionId,
    advisorAnswer: "Le dije que ayuda al metabolismo.",
    scores: nota(3),
    feedback: "Le faltó aclarar que no reemplaza dieta.",
    improvedAnswer: "Mejor así: acompaña el proceso, no lo reemplaza.",
  });

  const [ajena] = await connection.db
    .insert(trainingSessions)
    .values({ advisorId: otraAsesoraId, productId, practiceSize: 1 })
    .returning();
  if (!ajena) throw new Error("no se creo la sesion ajena");
  sessionAjenaId = ajena.id;
});

afterAll(async () => {
  for (const id of [asesoraId, otraAsesoraId]) {
    await connection.db.delete(trainingSessions).where(eq(trainingSessions.advisorId, id));
  }
  await connection.db.delete(trainingQuestions).where(eq(trainingQuestions.productId, productId));
  await connection.db.delete(products).where(eq(products.id, productId));
  for (const id of [asesoraId, otraAsesoraId, supervisorId]) {
    await connection.db.delete(advisors).where(eq(advisors.id, id));
  }
  await connection.close();
});

describe("quien puede revisar", () => {
  it("la supervision lee las practicas de una asesora", async () => {
    const result = await listAdvisorPractices(
      { advisorId: asesoraId },
      { authorize: comoSupervision, database: connection.db },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.advisor.displayName).toBe("Asesora Revisada");
    const practica = result.data.practices.find((row) => row.id === sessionId);
    expect(practica?.answered).toBe(1);
  });

  it("una asesora NO puede leer las practicas de nadie, ni las propias por esta puerta", async () => {
    // Ni siquiera pasandose su propio id: esta puerta es de acompañamiento. Su
    // resumen lo abre por `getPracticeSummary`, que se ata al dueño.
    for (const id of [asesoraId, otraAsesoraId]) {
      const lista = await listAdvisorPractices(
        { advisorId: id },
        { authorize: comoAsesora, database: connection.db },
      );
      expect(lista.ok).toBe(false);
      const detalle = await getAdvisorPracticeSummary(
        { advisorId: id, sessionId },
        { authorize: comoAsesora, database: connection.db },
      );
      expect(detalle.ok).toBe(false);
    }
  });

  it("el roster de acompañamiento no devuelve correos", async () => {
    const result = await listReviewableAdvisors({
      authorize: comoSupervision,
      database: connection.db,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // El correo y el poder de cambiar rangos siguen siendo de administracion.
    for (const fila of result.data) {
      expect(Object.keys(fila).sort()).toEqual(["displayName", "id", "role", "status"]);
    }
    expect(result.data.map((fila) => fila.id)).toContain(asesoraId);
  });

  it("una asesora no puede pedir el roster", async () => {
    const result = await listReviewableAdvisors({
      authorize: comoAsesora,
      database: connection.db,
    });
    expect(result.ok).toBe(false);
  });
});

describe("el detalle de una practica", () => {
  it("trae lo que respondio, el feedback y la version mejorada", async () => {
    const result = await getAdvisorPracticeSummary(
      { advisorId: asesoraId, sessionId },
      { authorize: comoSupervision, database: connection.db },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.advisor.displayName).toBe("Asesora Revisada");
    expect(result.data.summary.answered).toBe(1);
    const fila = result.data.summary.rows[0];
    expect(fila?.answer?.advisorAnswer).toBe("Le dije que ayuda al metabolismo.");
    expect(fila?.answer?.feedback).toContain("no reemplaza dieta");
    expect(fila?.answer?.improvedAnswer).toContain("acompaña el proceso");
  });

  it("cruzar asesora con practica ajena da NOT_FOUND", async () => {
    // El fallo que evita: si el filtro de dueño se cayera del WHERE, la
    // supervision podria recorrer practicas cambiando solo el id de la sesion.
    const result = await getAdvisorPracticeSummary(
      { advisorId: asesoraId, sessionId: sessionAjenaId },
      { authorize: comoSupervision, database: connection.db },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("una asesora inventada da NOT_FOUND y no una lista vacia", async () => {
    const result = await listAdvisorPractices(
      { advisorId: randomUUID() },
      { authorize: comoSupervision, database: connection.db },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Una lista vacia se leeria como "no ha practicado", que es otra cosa.
    expect(result.error.code).toBe("NOT_FOUND");
  });
});
