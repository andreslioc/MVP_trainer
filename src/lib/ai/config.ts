import { env } from "../env.ts";

export const AI_MODELS = Object.freeze({
  default: env.AI_MODEL_DEFAULT,
  small: env.AI_MODEL_SMALL,
});

export const AI_PROVIDER = Object.freeze({
  baseUrl: env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta",
  maxConcurrency: env.AI_MAX_CONCURRENCY,
});

/**
 * Presupuesto de razonamiento por nivel de esfuerzo.
 *
 * `low` es 0 a proposito, no por tacaneria: una clasificacion de intencion medida
 * contra el proveedor gasto 983 tokens de razonamiento para producir 6 de salida.
 * Con el presupuesto en 0 la misma llamada cuesta 29 tokens totales y acierta
 * igual. Donde la respuesta tiene una forma fija y una respuesta correcta, pensar
 * no compra nada y en un tier gratuito consume la cuota que otra llamada necesita.
 */
export const THINKING_BUDGET_BY_EFFORT = Object.freeze({
  low: 0,
  medium: 2_048,
  high: 8_192,
  xhigh: 16_384,
  max: 24_576,
} as const);

export type ModelPricing = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

const FREE = Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

/**
 * USD por millon de tokens.
 *
 * En cero porque este despliegue corre contra el tier gratuito del proveedor. La
 * tabla se conserva —y `llm_calls` sigue registrando cada token— porque el dia
 * que se pase a un plan pago el unico cambio es esta tabla, y el historico de
 * consumo ya existe para estimar la factura antes de recibirla. Un costo de 0
 * registrado no es lo mismo que no registrar el costo.
 */
export const MODEL_PRICING_USD_PER_MTOK: Readonly<Record<string, ModelPricing>> = Object.freeze({
  [AI_MODELS.default]: FREE,
  [AI_MODELS.small]: FREE,
});
