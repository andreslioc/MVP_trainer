import type { ZodType } from "zod";

import type { AiGateway, AiGatewayError, GenerateTextInput } from "./gateway.ts";

export type StructuredOutputInput<T> = GenerateTextInput & { schema: ZodType<T> };

export type StructuredOutputResult<T> =
  | { ok: true; data: { value: T; repaired: boolean } }
  | {
      ok: false;
      error: AiGatewayError | { code: "AI_INVALID_OUTPUT"; message: string };
    };

function repairMessages(input: StructuredOutputInput<unknown>, rawText: string, error: string) {
  return [
    ...input.messages,
    ...(rawText ? [{ role: "assistant" as const, content: rawText }] : []),
    {
      role: "user" as const,
      content: [
        "La salida anterior no cumplio el contrato estructurado.",
        `Error de validacion: ${error}`,
        "Corrige todos los campos y responde nuevamente con el formato exigido.",
      ].join("\n"),
    },
  ];
}

export async function generateStructured<T>(
  input: StructuredOutputInput<T>,
  gateway: Pick<AiGateway, "generateStructuredAttempt">,
): Promise<StructuredOutputResult<T>> {
  const first = await gateway.generateStructuredAttempt(input);
  if (first.ok) return { ok: true, data: { value: first.data.value, repaired: false } };
  if (first.error.code !== "AI_INVALID_OUTPUT") return first;

  const second = await gateway.generateStructuredAttempt({
    ...input,
    messages: repairMessages(input, first.error.rawText, first.error.validationError),
  });
  if (second.ok) return { ok: true, data: { value: second.data.value, repaired: true } };
  if (second.error.code !== "AI_INVALID_OUTPUT") return second;

  return {
    ok: false,
    error: {
      code: "AI_INVALID_OUTPUT",
      message: "La salida de IA siguio siendo invalida despues de una reparacion.",
    },
  };
}
