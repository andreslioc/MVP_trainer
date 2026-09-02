/**
 * Bucle de reparacion: el error del gate vuelve al modelo hasta dos veces.
 *
 * Sin este paso, cada intento de una ficha rechazada vuelve a investigar desde
 * cero, a ciegas, esperando que el muestreo del modelo caiga bien. Medido: tres
 * corridas seguidas del mismo producto fallaron por tres reglas distintas y
 * cada una de una linea —un alergeno que no llego a la lista corta, la palabra
 * "vehiculo" en la descripcion, una frase de trazabilidad en el guion del
 * live—; y cuatro pasadas completas sobre 149 fichas dieron 128, 138, 140 y
 * 143. Los mensajes del gate ya nombraban el campo y el motivo: solo no
 * llegaban a quien podia usarlos.
 *
 * Vive aparte del orquestador porque aquel ya esta en su limite de tamaño y
 * porque esto se prueba solo, con un reparador falso y sin proveedor de IA.
 */

import { buildRepairCardPrompt } from "../lib/ai/prompts/repair-card.ts";
import { type RepairedCard, repairedCardSchema } from "../lib/ai/schemas.ts";
import type { StructuredOutputInput, StructuredOutputResult } from "../lib/ai/structured.ts";
import { applyRepair, isRepairable } from "../lib/repair-patch.ts";
import { productInputSchema } from "../lib/validation/product.ts";

type Patch = Record<string, unknown>;

/**
 * Dos rondas y no mas: la tercera repite el error de la segunda —el modelo ya
 * dijo todo lo que sabe de ese campo— y solo gasta tokens.
 */
const MAX_ROUNDS = 2;

export async function repairUntilValid(input: {
  patch: Patch;
  base: Patch;
  advisorId: string;
  promptId: string | null;
  repair: (
    input: StructuredOutputInput<RepairedCard>,
  ) => Promise<StructuredOutputResult<RepairedCard>>;
}) {
  let patch = input.patch;
  let parsed = productInputSchema.safeParse({ ...input.base, ...patch });
  let rounds = 0;

  while (!parsed.success && rounds < MAX_ROUNDS) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    // Un rechazo por un campo que el reparador no puede tocar no se manda a
    // reparar: la llamada saldria vacia y el error seria el mismo.
    if (!isRepairable(issues.map((issue) => issue.path))) break;

    // Se cuenta la ronda cuando de verdad se llama al modelo: `rounds` es lo
    // que el lote reporta, y contar intentos que nunca salieron miente.
    rounds += 1;
    const prompt = buildRepairCardPrompt({ issues, card: patch });
    const result = await input.repair({
      advisorId: input.advisorId,
      purpose: "structured_repair",
      promptId: input.promptId,
      schema: repairedCardSchema,
      system: prompt.system,
      messages: prompt.messages,
      maxTokens: 3_000,
      effort: "low",
    });
    if (!result.ok) break;

    const antes = JSON.stringify(patch);
    patch = applyRepair(patch, result.data.value);
    // Una correccion que no cambio nada no va a cambiar nada en la ronda
    // siguiente: cortar aqui evita una llamada segura de ser inutil.
    if (JSON.stringify(patch) === antes) break;
    parsed = productInputSchema.safeParse({ ...input.base, ...patch });
  }

  return { patch, parsed, rounds };
}
