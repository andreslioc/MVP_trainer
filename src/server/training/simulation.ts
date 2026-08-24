/**
 * Simulacro de live: arranque y cierre.
 *
 * El guion se arma AQUI y no en el navegador. El momento en que aparecio una
 * pregunta es la verdad contra la que se mide la atencion de la asesora, y un
 * dato que el cliente puede editar no sirve de verdad.
 *
 * El analisis del cierre reusa lo de Live Intelligence sin cambiarlo: el chat
 * del simulacro sale en el mismo formato que `parseChatLog` lee, y la
 * transcripcion con marcas [Xs] es la que `collectChatCoverage` ya sabe recorrer
 * por ventanas. La unica diferencia es que aqui las preguntas no hay que
 * buscarlas: las inyectamos nosotros.
 */

import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../db/client.ts";
import { liveSimulations, products, prompts, trainingQuestions } from "../../db/schema.ts";
import {
  buildTimeline,
  questionForChat,
  type SimSpeed,
  timelineToChatLog,
} from "../../lib/simulator/chat-player.ts";
import { type AdvisorRole, requireRole } from "../../lib/auth.ts";
import { logFailure } from "../../lib/log.ts";

type SimulationDatabase = Pick<typeof db, "select" | "insert" | "update">;
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };
type Authorize = (role: AdvisorRole) => Promise<AuthorizationResult>;

export type SimulationDependencies = {
  database?: SimulationDatabase;
  authorize?: Authorize;
  random?: () => number;
};

function dependencies(options: SimulationDependencies) {
  return {
    database: options.database ?? db,
    authorize: options.authorize ?? requireRole,
    random: options.random ?? Math.random,
  };
}

const startInputSchema = z
  .object({
    speed: z.enum(["despacio", "normal", "rapido", "aleatorio"]),
    /** Un simulacro corto se practica mas veces. Media hora nadie la repite. */
    durationS: z.number().int().min(60).max(600),
    questionCount: z.number().int().min(1).max(10),
  })
  .strict();

export type StartSimulationInput = z.input<typeof startInputSchema>;

/**
 * Arranca un simulacro.
 *
 * Las preguntas salen de fichas verificadas y de VARIAS a la vez: en un live
 * real nadie pregunta por un solo producto durante cinco minutos, y cambiar de
 * ficha en caliente es justo lo que cuesta.
 */
export async function startSimulation(input: unknown, options: SimulationDependencies = {}) {
  const { database, authorize, random } = dependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;

  const parsed = startInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: {
        code: "VALIDATION",
        message: z.prettifyError(parsed.error),
        field: parsed.error.issues[0]?.path[0]?.toString(),
      },
    };
  }

  try {
    // `random()` en el orden para que dos simulacros seguidos no traigan las
    // mismas preguntas: repetir la misma tanda entrena a memorizar, no a
    // responder.
    const candidates = await database
      .select({
        id: trainingQuestions.id,
        productId: trainingQuestions.productId,
        text: trainingQuestions.text,
        difficulty: trainingQuestions.difficulty,
        productName: products.name,
      })
      .from(trainingQuestions)
      .innerJoin(products, eq(products.id, trainingQuestions.productId))
      .where(isNotNull(products.verifiedAt))
      .orderBy(sql`random()`)
      .limit(parsed.data.questionCount);

    if (candidates.length === 0) {
      return {
        ok: false as const,
        error: {
          code: "NO_QUESTIONS",
          message: "No hay preguntas de fichas verificadas. Genera una tanda en el Simulator.",
        },
      };
    }

    const timeline = buildTimeline({
      // Nombrando el producto: en el simulacro no hay nada en camara que diga
      // de que ficha se esta hablando.
      questions: candidates.map((question) => ({
        id: question.id,
        text: question.text,
        productName: question.productName,
      })),
      durationMs: parsed.data.durationS * 1_000,
      speed: parsed.data.speed as SimSpeed,
      random,
    });

    // Solo las lineas que COMPLETAN la pregunta entran al guion, y con el texto
    // entero. Una pregunta partida se responde desde su segunda pieza, y el
    // analisis necesita la pregunta completa, no el pedazo que se vio ultimo.
    const script = timeline
      .filter((line) => line.completesQuestion)
      .map((line) => {
        const question = candidates.find((candidate) => candidate.id === line.questionId);
        return {
          question_id: line.questionId as string,
          product_id: question?.productId ?? "",
          at_ms: line.atMs,
          text: questionForChat(question?.text ?? line.text, question?.productName ?? ""),
          // Dos lineas con el mismo id significa que se partio en dos mensajes.
          // Se guarda porque cambia como leer el resultado: una pregunta
          // partida es mas dificil de cazar, y no haberla visto dice otra cosa.
          split: timeline.filter((other) => other.questionId === line.questionId).length > 1,
        };
      });

    const [created] = await database
      .insert(liveSimulations)
      .values({
        advisorId: authorization.data.id,
        speed: parsed.data.speed,
        durationS: parsed.data.durationS,
        script,
        chatLog: timelineToChatLog(timeline),
      })
      .returning({ id: liveSimulations.id });
    if (!created) throw new Error("No se creo el simulacro.");

    return { ok: true as const, data: { id: created.id, timeline } };
  } catch (error) {
    logFailure("startSimulation", error);
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudo iniciar el simulacro." },
    };
  }
}

/** Simulacro propio y todavia sin cerrar. */
export async function getOpenSimulation(
  simulationId: string,
  advisorId: string,
  database: SimulationDatabase,
) {
  const [simulation] = await database
    .select({
      id: liveSimulations.id,
      durationS: liveSimulations.durationS,
      script: liveSimulations.script,
      chatLog: liveSimulations.chatLog,
    })
    .from(liveSimulations)
    .where(
      and(
        eq(liveSimulations.id, simulationId),
        eq(liveSimulations.advisorId, advisorId),
        isNull(liveSimulations.finishedAt),
      ),
    )
    .limit(1);
  return simulation ?? null;
}

/** El prompt activo de cobertura, que el analisis del cierre reusa. */
export async function activeCoveragePromptId(database: SimulationDatabase) {
  const [prompt] = await database
    .select({ id: prompts.id })
    .from(prompts)
    .where(and(eq(prompts.name, "chat_coverage"), eq(prompts.active, true)))
    .orderBy(desc(prompts.version))
    .limit(1);
  return prompt?.id ?? null;
}

/** Simulacros de la asesora, del mas reciente al mas viejo. */
export async function listSimulations(options: SimulationDependencies = {}) {
  const { database, authorize } = dependencies(options);
  const authorization = await authorize("asesor");
  if (!authorization.ok) return authorization;

  try {
    const rows = await database
      .select({
        id: liveSimulations.id,
        speed: liveSimulations.speed,
        durationS: liveSimulations.durationS,
        script: liveSimulations.script,
        results: liveSimulations.results,
        startedAt: liveSimulations.startedAt,
        finishedAt: liveSimulations.finishedAt,
      })
      .from(liveSimulations)
      .where(eq(liveSimulations.advisorId, authorization.data.id))
      .orderBy(desc(liveSimulations.startedAt))
      .limit(20);
    return { ok: true as const, data: rows };
  } catch (error) {
    logFailure("listSimulations", error);
    return {
      ok: false as const,
      error: { code: "INTERNAL", message: "No se pudieron cargar los simulacros." },
    };
  }
}

/** Orden estable de las preguntas del guion. Lo usan el cierre y las pruebas. */
export function scriptQuestions(script: Array<{ question_id: string; at_ms: number }>) {
  return [...script].sort((a, b) => a.at_ms - b.at_ms);
}
