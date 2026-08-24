import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openDirectDatabase } from "../../src/db/client.ts";
import {
  advisors,
  liveSimulations,
  products,
  prompts,
  trainingQuestions,
} from "../../src/db/schema.ts";
import { productInputSchema } from "../../src/lib/validation/product.ts";
import { startSimulation } from "../../src/server/training/simulation.ts";
import { validProductInput } from "../fixtures/product.ts";

const connection = openDirectDatabase("test");
const advisorId = randomUUID();
const otherAdvisorId = randomUUID();
const productA = randomUUID();
const productB = randomUUID();
const promptVersion = Number.parseInt(randomUUID().slice(0, 7), 16);

const authorize = async () => ({
  ok: true as const,
  data: { id: advisorId, role: "asesor" as const },
});

/** Azar determinista: una prueba que depende de Math.random no es una prueba. */
function seeded(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

async function crearProducto(id: string, nombre: string) {
  await connection.db.insert(products).values({
    id,
    ...productInputSchema.parse(
      validProductInput({ name: nombre, verifiedAt: new Date("2026-08-18T12:00:00Z") }),
    ),
  });
  for (let index = 0; index < 4; index += 1) {
    await connection.db.insert(trainingQuestions).values({
      productId: id,
      text: `${nombre}: pregunta ${index}`,
      intent: "informacion",
      difficulty: "basica",
      idealAnswer: "Respuesta ideal de la ficha.",
      criteria: ["Menciona la ficha"],
      source: "generated",
    });
  }
}

beforeAll(async () => {
  await connection.db.insert(advisors).values([
    {
      id: advisorId,
      email: `sim-${advisorId}@example.test`,
      displayName: "Sim",
      role: "asesor",
      status: "activa",
    },
    {
      id: otherAdvisorId,
      email: `otra-${otherAdvisorId}@example.test`,
      displayName: "Otra",
      role: "asesor",
      status: "activa",
    },
  ]);
  await crearProducto(productA, `Creatina sim ${productA.slice(0, 8)}`);
  await crearProducto(productB, `Magnesio sim ${productB.slice(0, 8)}`);
  await connection.db.insert(prompts).values({
    name: "chat_coverage",
    version: promptVersion,
    body: "cobertura",
    active: true,
  });
});

afterAll(async () => {
  await connection.db.delete(liveSimulations).where(eq(liveSimulations.advisorId, advisorId));
  for (const id of [productA, productB]) {
    await connection.db.delete(trainingQuestions).where(eq(trainingQuestions.productId, id));
    await connection.db.delete(products).where(eq(products.id, id));
  }
  await connection.db.delete(advisors).where(eq(advisors.id, advisorId));
  await connection.db.delete(advisors).where(eq(advisors.id, otherAdvisorId));
  await connection.db.delete(prompts).where(eq(prompts.version, promptVersion));
  await connection.close();
});

describe("startSimulation", () => {
  it("guarda el guion en el servidor, no en el navegador", async () => {
    // El segundo en que aparecio una pregunta es la verdad contra la que se
    // mide la atencion. Si lo armara el cliente, seria un dato editable.
    const result = await startSimulation(
      { speed: "aleatorio", durationS: 180, questionCount: 4 },
      { authorize, database: connection.db, random: seeded() },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [row] = await connection.db
      .select({ script: liveSimulations.script, chatLog: liveSimulations.chatLog })
      .from(liveSimulations)
      .where(eq(liveSimulations.id, result.data.id));

    expect(row?.script).toHaveLength(4);
    expect(row?.chatLog).toBeTruthy();
    for (const entry of row?.script ?? []) {
      expect(entry.at_ms).toBeGreaterThanOrEqual(8_000);
      expect(entry.product_id).toBeTruthy();
    }
  });

  it("el chat guardado trae relleno, no solo las preguntas", async () => {
    const result = await startSimulation(
      { speed: "normal", durationS: 180, questionCount: 3 },
      { authorize, database: connection.db, random: seeded(3) },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [row] = await connection.db
      .select({ chatLog: liveSimulations.chatLog, script: liveSimulations.script })
      .from(liveSimulations)
      .where(eq(liveSimulations.id, result.data.id));

    const lineas = (row?.chatLog ?? "").split("\n").filter(Boolean);
    expect(lineas.length).toBeGreaterThan((row?.script ?? []).length * 3);
  });

  it("mezcla preguntas de mas de una ficha", async () => {
    // En un live real nadie pregunta por un solo producto cinco minutos.
    const result = await startSimulation(
      { speed: "normal", durationS: 300, questionCount: 8 },
      { authorize, database: connection.db, random: seeded(11) },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [row] = await connection.db
      .select({ script: liveSimulations.script })
      .from(liveSimulations)
      .where(eq(liveSimulations.id, result.data.id));

    expect(new Set((row?.script ?? []).map((entry) => entry.product_id)).size).toBeGreaterThan(1);
  });

  it("cada pregunta del chat nombra su producto", async () => {
    // Sin el nombre, "¿para que sirve?" es imposible de responder: el simulacro
    // mezcla fichas y no hay producto en camara que aclare de cual se habla.
    const result = await startSimulation(
      { speed: "normal", durationS: 300, questionCount: 6 },
      { authorize, database: connection.db, random: seeded(23) },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [row] = await connection.db
      .select({ script: liveSimulations.script })
      .from(liveSimulations)
      .where(eq(liveSimulations.id, result.data.id));

    const nombres = await connection.db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(eq(products.id, productA));

    for (const entry of row?.script ?? []) {
      if (entry.product_id !== productA) continue;
      const nombre = nombres[0]?.name ?? "";
      // El nombre sembrado empieza con "Creatina sim" o "Magnesio sim".
      expect(entry.text.toLowerCase()).toContain(nombre.split(" ")[0]?.toLowerCase() ?? "");
    }
  });

  it("el guion guarda la pregunta y si llegó partida", async () => {
    // El resultado tiene que poder decir QUÉ se preguntó y CÓMO llegó: una
    // pregunta partida en dos mensajes es más difícil de cazar, y no haberla
    // visto significa otra cosa que no ver una que llegó entera.
    const result = await startSimulation(
      { speed: "normal", durationS: 300, questionCount: 6 },
      { authorize, database: connection.db, random: seeded(31) },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [row] = await connection.db
      .select({ script: liveSimulations.script })
      .from(liveSimulations)
      .where(eq(liveSimulations.id, result.data.id));

    for (const entry of row?.script ?? []) {
      expect(entry.text.length).toBeGreaterThan(0);
      expect(typeof entry.split).toBe("boolean");
    }
    // Que ALGUNA salga partida depende del azar, y eso no es comportamiento
    // sino loteria: el partido se prueba de forma determinista en
    // `chat-player.test.ts`. Aqui solo importa que el dato viaje.
  });

  it("rechaza una duracion fuera de rango", async () => {
    const result = await startSimulation(
      { speed: "normal", durationS: 5, questionCount: 2 },
      { authorize, database: connection.db, random: seeded() },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION");
  });

  it("no arranca sin sesion", async () => {
    const result = await startSimulation(
      { speed: "normal", durationS: 180, questionCount: 2 },
      {
        authorize: async () => ({
          ok: false as const,
          error: { code: "UNAUTHORIZED", message: "Sin sesión." },
        }),
        database: connection.db,
      },
    );

    expect(result.ok).toBe(false);
  });
});
