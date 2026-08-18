import { z } from "zod";

import type { ProductInput, ValidProductInput } from "../../../../lib/validation/product.ts";

const required = z.string().trim().min(1, "Este campo es obligatorio.");
const jsonArray = z.string().refine((value) => {
  try {
    return Array.isArray(JSON.parse(value));
  } catch {
    return false;
  }
}, "Escribe un arreglo JSON válido.");

export const productFormSchema = z.object({
  name: required,
  brand: required,
  category: required,
  presentation: required,
  format: required,
  activeIngredientsJson: jsonArray,
  benefits: z
    .array(
      z.object({
        claim: required,
        science_note: required,
        evidence_level: z.enum(["alta", "media", "baja"]),
      }),
    )
    .length(3),
  faqsJson: jsonArray,
  objectionsJson: jsonArray,
  differentiatorsJson: jsonArray,
  precautions: z.string(),
  claimsAllowedText: z.string(),
  claimsCautionText: z.string(),
  claimsForbiddenText: z.string(),
  complementProductIdsText: z.string(),
  sourcesJson: jsonArray,
  verified: z.boolean(),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;
export type EditableProduct = ValidProductInput & { id: string };

function lines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function productFormDefaults(product?: EditableProduct): ProductFormValues {
  return {
    name: product?.name ?? "",
    brand: product?.brand ?? "",
    category: product?.category ?? "",
    presentation: product?.presentation ?? "",
    format: product?.format ?? "",
    activeIngredientsJson: JSON.stringify(product?.activeIngredients ?? [], null, 2),
    benefits: product?.benefits.map(({ claim, science_note, evidence_level }) => ({
      claim,
      science_note,
      evidence_level,
    })) ?? [
      { claim: "", science_note: "", evidence_level: "media" },
      { claim: "", science_note: "", evidence_level: "media" },
      { claim: "", science_note: "", evidence_level: "media" },
    ],
    faqsJson: JSON.stringify(product?.faqs ?? [], null, 2),
    objectionsJson: JSON.stringify(product?.objections ?? [], null, 2),
    differentiatorsJson: JSON.stringify(product?.differentiators ?? [], null, 2),
    precautions: product?.precautions ?? "",
    claimsAllowedText: product?.claimsAllowed.join("\n") ?? "",
    claimsCautionText: product?.claimsCaution.join("\n") ?? "",
    claimsForbiddenText: product?.claimsForbidden.join("\n") ?? "",
    complementProductIdsText: product?.complementProductIds.join("\n") ?? "",
    sourcesJson: JSON.stringify(product?.sources ?? [], null, 2),
    verified: Boolean(product?.verifiedAt),
  };
}

export function toProductInput(values: ProductFormValues, product?: EditableProduct): ProductInput {
  return {
    name: values.name,
    brand: values.brand,
    category: values.category,
    presentation: values.presentation,
    format: values.format,
    activeIngredients: JSON.parse(values.activeIngredientsJson),
    benefits: values.benefits.map((benefit, index) => ({ ...benefit, rank: index + 1 })),
    faqs: JSON.parse(values.faqsJson),
    objections: JSON.parse(values.objectionsJson),
    differentiators: JSON.parse(values.differentiatorsJson),
    precautions: values.precautions,
    claimsAllowed: lines(values.claimsAllowedText),
    claimsCaution: lines(values.claimsCautionText),
    claimsForbidden: lines(values.claimsForbiddenText),
    complementProductIds: lines(values.complementProductIdsText),
    sources: JSON.parse(values.sourcesJson),
    verifiedAt: values.verified ? (product?.verifiedAt ?? new Date()) : null,
  } as ProductInput;
}
