import { z } from "zod";

const requiredText = z.string().trim().min(1, "Este campo es obligatorio.");
const optionalText = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);
const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url("La URL no es válida.").optional(),
);

export const activeIngredientSchema = z
  .object({
    name: requiredText,
    amount_per_serving: z.number().positive("La cantidad debe ser positiva.").optional(),
    unit: optionalText,
    verified: z.boolean(),
  })
  .superRefine((ingredient, context) => {
    if (!ingredient.verified && ingredient.amount_per_serving !== undefined) {
      context.addIssue({
        code: "custom",
        message: "La cantidad solo puede registrarse cuando el ingrediente está verificado.",
        path: ["amount_per_serving"],
      });
    }
    if (ingredient.amount_per_serving !== undefined && !ingredient.unit) {
      context.addIssue({
        code: "custom",
        message: "La unidad es obligatoria cuando existe una cantidad.",
        path: ["unit"],
      });
    }
  });

export const productBenefitSchema = z.object({
  rank: z.number().int().min(1).max(3),
  claim: requiredText,
  science_note: requiredText,
  evidence_level: z.enum(["alta", "media", "baja"]),
});

const sourceSchema = z.object({
  label: requiredText,
  url: optionalUrl,
  note: optionalText,
});

export const productInputSchema = z
  .object({
    name: requiredText,
    brand: requiredText,
    category: requiredText,
    presentation: requiredText,
    format: requiredText,
    activeIngredients: z.array(activeIngredientSchema),
    benefits: z
      .array(productBenefitSchema)
      .length(3, "La ficha debe contener exactamente tres beneficios priorizados."),
    faqs: z.array(z.object({ question: requiredText, answer: requiredText })),
    objections: z.array(z.object({ objection: requiredText, response: requiredText })),
    differentiators: z.array(z.object({ claim: requiredText, evidence: requiredText })),
    precautions: z.string().trim(),
    claimsAllowed: z.array(requiredText),
    claimsCaution: z.array(requiredText),
    claimsForbidden: z.array(requiredText),
    complementProductIds: z.array(z.uuid()).max(3),
    sources: z.array(sourceSchema),
    verifiedAt: z.coerce.date().nullable().optional(),
  })
  .superRefine((product, context) => {
    const ranks = new Set(product.benefits.map((benefit) => benefit.rank));
    if (ranks.size !== 3 || ![1, 2, 3].every((rank) => ranks.has(rank))) {
      context.addIssue({
        code: "custom",
        message: "Los beneficios deben usar los rangos 1, 2 y 3 una sola vez.",
        path: ["benefits"],
      });
    }

    if (
      product.benefits.some((benefit) => benefit.evidence_level === "alta") &&
      product.sources.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "La evidencia alta requiere al menos una fuente.",
        path: ["sources"],
      });
    }
  });

export type ProductInput = z.input<typeof productInputSchema>;
export type ValidProductInput = z.output<typeof productInputSchema>;

export function productValidationError(error: z.ZodError) {
  const issue = error.issues[0];
  return {
    code: "INVALID_PRODUCT" as const,
    message: z.prettifyError(error),
    field: issue?.path[0]?.toString(),
  };
}
