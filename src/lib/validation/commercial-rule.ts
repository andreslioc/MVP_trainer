import { z } from "zod";

const requiredText = z.string().trim().min(1, "El texto de la regla es obligatorio.");
const thresholdSchema = z
  .number()
  .int("El umbral debe ser un número entero.")
  .positive("El umbral debe ser mayor que cero.");
/**
 * El margen SI admite cero, a diferencia del umbral.
 *
 * Poner el margen en cero es una decision valida —"el precio de la ficha es el
 * unico correcto"— y no un campo sin llenar. Con `.positive()` esa eleccion
 * seria imposible de guardar.
 */
const marginSchema = z
  .number()
  .int("El margen debe ser un número entero.")
  .min(0, "El margen no puede ser negativo.")
  .max(1_000_000, "Un margen mayor que un millón de pesos no distingue nada.");

export const commercialRuleKeys = [
  "originalidad",
  "envio_gratis",
  "promo_live",
  "seguir_tiktok",
  "canal_whatsapp",
  "cupon_por_seguir",
  "margen_precio",
] as const;

export type CommercialRuleKey = (typeof commercialRuleKeys)[number];

export function isCommercialRuleKey(value: string): value is CommercialRuleKey {
  return commercialRuleKeys.includes(value as CommercialRuleKey);
}

const valueSchemas = {
  originalidad: z.object({ message: requiredText }).strict(),
  envio_gratis: z.object({ threshold_cop: thresholdSchema }).strict(),
  promo_live: z.object({ message: requiredText }).strict(),
  seguir_tiktok: z.object({ cta: requiredText }).strict(),
  canal_whatsapp: z.object({ cta: requiredText }).strict(),
  cupon_por_seguir: z.object({ message: requiredText }).strict(),
  margen_precio: z.object({ margin_cop: marginSchema }).strict(),
} satisfies Record<CommercialRuleKey, z.ZodType>;

const ruleUpdateBaseSchema = z.object({
  key: z.enum(commercialRuleKeys),
  value: z.unknown(),
  active: z.boolean(),
});

export type CommercialRuleUpdate = z.input<typeof ruleUpdateBaseSchema>;
export type ValidCommercialRuleUpdate = {
  key: CommercialRuleKey;
  value: Record<string, unknown>;
  active: boolean;
};

export function parseCommercialRuleUpdate(input: CommercialRuleUpdate) {
  const base = ruleUpdateBaseSchema.safeParse(input);
  if (!base.success) return base;

  const value = valueSchemas[base.data.key].safeParse(base.data.value);
  if (!value.success) {
    return {
      success: false as const,
      error: new z.ZodError(
        value.error.issues.map((issue) => ({ ...issue, path: ["value", ...issue.path] })),
      ),
    };
  }

  return {
    success: true as const,
    data: { ...base.data, value: value.data as Record<string, unknown> },
  };
}

export function commercialRuleValidationError(error: z.ZodError) {
  return {
    code: "INVALID_COMMERCIAL_RULE" as const,
    message: z.prettifyError(error),
    field: error.issues[0]?.path[0]?.toString(),
  };
}
