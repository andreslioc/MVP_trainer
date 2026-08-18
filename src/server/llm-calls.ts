import { z } from "zod";

import { db } from "../db/client.ts";
import { llmCalls } from "../db/schema.ts";

const llmCallInputSchema = z.object({
  advisorId: z.uuid().nullable(),
  purpose: z.string().trim().min(1),
  model: z.string().trim().min(1),
  latencyMs: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  costUsd: z.number().finite().nonnegative(),
  finishReason: z.string().trim().min(1),
  error: z.string().trim().min(1).nullable(),
  promptId: z.uuid().nullable(),
});

export type LlmCallInput = z.infer<typeof llmCallInputSchema>;
type LlmCallDatabase = Pick<typeof db, "insert">;

export type LlmCallWriteResult =
  | { ok: true; data: typeof llmCalls.$inferSelect }
  | { ok: false; error: { code: "INVALID_LLM_CALL" | "LLM_CALL_WRITE_FAILED"; message: string } };

export async function writeLlmCall(
  input: LlmCallInput,
  options: { database?: LlmCallDatabase } = {},
): Promise<LlmCallWriteResult> {
  const parsed = llmCallInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "INVALID_LLM_CALL", message: "La traza de IA no es valida." },
    };
  }

  try {
    const [created] = await (options.database ?? db)
      .insert(llmCalls)
      .values({ ...parsed.data, costUsd: parsed.data.costUsd.toFixed(6) })
      .returning();
    if (!created) throw new Error("La insercion no devolvio una fila.");
    return { ok: true, data: created };
  } catch {
    return {
      ok: false,
      error: { code: "LLM_CALL_WRITE_FAILED", message: "No se pudo guardar la traza de IA." },
    };
  }
}
