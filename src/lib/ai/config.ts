import { env } from "../env.ts";

export const AI_MODELS = Object.freeze({
  default: env.AI_MODEL_DEFAULT,
  small: env.AI_MODEL_SMALL,
});

export const AI_CONFIG = Object.freeze({
  maxConcurrency: env.AI_MAX_CONCURRENCY,
  betaHeaders: ["server-side-fallback-2026-07-01"] as const,
  fallback: "default" as const,
});

export type ModelPricing = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

// USD por millon de tokens. La escritura corresponde al TTL efimero de 5 minutos.
export const MODEL_PRICING_USD_PER_MTOK: Readonly<Record<string, ModelPricing>> = Object.freeze({
  [AI_MODELS.default]: Object.freeze({
    input: 5,
    output: 25,
    cacheRead: 0.5,
    cacheWrite: 6.25,
  }),
});
