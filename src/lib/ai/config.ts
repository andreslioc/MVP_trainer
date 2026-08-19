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

/**
 * USD por millon de tokens. Precios de lista del proveedor.
 *
 * Fuente: https://ai.google.dev/gemini-api/docs/pricing, consultada el
 * 19-ago-2026. Cuando cambien, se cambian aqui y en ningun otro lado.
 *
 * La tabla se indexa por **id de modelo**, no por `AI_MODELS.default`. Antes se
 * construia con la llave del env apuntando a cero, asi que mover
 * `AI_MODEL_DEFAULT` dejaba la tabla alineada por accidente y siempre en cero.
 * Con un catalogo por id, cambiar de modelo trae su precio real, y un modelo que
 * no este aqui cae al cero del gateway — que es visible en `llm_calls` porque el
 * consumo de tokens si queda registrado.
 *
 * `cost_usd` pasa a significar **precio de lista de lo consumido**, no lo
 * facturado. Sobre el tier gratuito no te cobran, pero el ledger ya te dice
 * cuanto costaria ese mismo uso pagando, que es justo lo que hace falta para
 * estimar la factura antes de recibirla.
 *
 * Dos cosas que esta tabla NO modela:
 *
 * - **`input` es el precio del TEXTO.** El audio cuesta entre el doble y el
 *   triple (flash-lite: $0.25 texto contra $0.50 audio). Hoy da igual porque
 *   nada manda audio a este proveedor —la transcripcion va por Deepgram o
 *   Groq—, pero el dia que alguien lo intente, el ledger lo subestimaria.
 * - **`cacheWrite` es 0 a proposito.** El proveedor no reporta escritura de
 *   cache porque su cacheo implicito no la cobra aparte. Cero medido, no cero
 *   inventado.
 */
export const MODEL_PRICING_USD_PER_MTOK: Readonly<Record<string, ModelPricing>> = Object.freeze({
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4, cacheRead: 0.01, cacheWrite: 0 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5, cacheRead: 0.03, cacheWrite: 0 },
  "gemini-3-flash-preview": { input: 0.5, output: 3.0, cacheRead: 0.05, cacheWrite: 0 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5, cacheRead: 0.025, cacheWrite: 0 },
  "gemini-3.5-flash": { input: 1.5, output: 9.0, cacheRead: 0.15, cacheWrite: 0 },
  // OJO: 3.6 y 3.7 estan en precio promocional hasta el 31-dic-2026. El
  // 1-ene-2027 se DUPLICAN los tres valores ($1.50 / $7.50 / $0.15). Si alguno
  // sigue en uso para entonces, esta tabla miente hasta que se actualice.
  "gemini-3.6-flash": { input: 0.75, output: 3.75, cacheRead: 0.075, cacheWrite: 0 },
  "gemini-3.7-flash": { input: 0.75, output: 3.75, cacheRead: 0.075, cacheWrite: 0 },
});
