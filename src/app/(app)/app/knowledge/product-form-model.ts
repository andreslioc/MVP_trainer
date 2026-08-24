import { z } from "zod";

import type { ProductInput, ValidProductInput } from "../../../../lib/validation/product.ts";

const required = z.string().trim().min(1, "Este campo es obligatorio.");

/**
 * Las cantidades y las URLs viajan como texto y no como numero u URL validada.
 *
 * El formulario tiene que poder estar a medio llenar sin pelear: un campo vacio
 * no es un cero ni una URL invalida, es un campo que la asesora todavia no
 * escribio. La conversion y la validacion real pasan en `toProductInput` y en
 * `productInputSchema`, que es el borde donde importan.
 */
const optionalText = z.string();

export const productFormSchema = z.object({
  sku: optionalText,
  name: required,
  brand: required,
  category: required,
  presentation: required,
  format: required,
  imageUrl: optionalText,
  description: z.string(),
  activeIngredients: z.array(
    z.object({
      name: required,
      amountText: optionalText,
      unit: optionalText,
      verified: z.boolean(),
    }),
  ),
  benefits: z
    .array(
      z.object({
        claim: required,
        science_note: required,
        evidence_level: z.enum(["alta", "media", "baja"]),
      }),
    )
    .length(3),
  faqs: z.array(z.object({ question: required, answer: required })),
  objections: z.array(z.object({ objection: required, response: required })),
  differentiators: z.array(z.object({ claim: required, evidence: required })),
  precautions: z.string(),
  claimsAllowedText: z.string(),
  claimsCautionText: z.string(),
  claimsForbiddenText: z.string(),
  complementProductIdsText: z.string(),
  sources: z.array(z.object({ label: required, url: optionalText, note: optionalText })),
  /** En pesos, como texto: el input vacio tiene que poder distinguirse de un 0. */
  priceCopText: z.string(),
  verified: z.boolean(),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;
export type EditableProduct = Omit<ValidProductInput, "sku" | "imageUrl"> & {
  id: string;
  sku: string | null;
  imageUrl: string | null;
};

function lines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function productFormDefaults(product?: EditableProduct): ProductFormValues {
  return {
    sku: product?.sku ?? "",
    name: product?.name ?? "",
    brand: product?.brand ?? "",
    category: product?.category ?? "",
    presentation: product?.presentation ?? "",
    format: product?.format ?? "",
    imageUrl: product?.imageUrl ?? "",
    description: product?.description ?? "",
    activeIngredients:
      product?.activeIngredients.map((ingredient) => ({
        name: ingredient.name,
        amountText:
          ingredient.amount_per_serving === undefined ? "" : String(ingredient.amount_per_serving),
        unit: ingredient.unit ?? "",
        verified: ingredient.verified,
      })) ?? [],
    benefits: product?.benefits.map(({ claim, science_note, evidence_level }) => ({
      claim,
      science_note,
      evidence_level,
    })) ?? [
      { claim: "", science_note: "", evidence_level: "media" },
      { claim: "", science_note: "", evidence_level: "media" },
      { claim: "", science_note: "", evidence_level: "media" },
    ],
    faqs: product?.faqs.map(({ question, answer }) => ({ question, answer })) ?? [],
    objections:
      product?.objections.map(({ objection, response }) => ({ objection, response })) ?? [],
    differentiators:
      product?.differentiators.map(({ claim, evidence }) => ({ claim, evidence })) ?? [],
    precautions: product?.precautions ?? "",
    claimsAllowedText: product?.claimsAllowed.join("\n") ?? "",
    claimsCautionText: product?.claimsCaution.join("\n") ?? "",
    claimsForbiddenText: product?.claimsForbidden.join("\n") ?? "",
    complementProductIdsText: product?.complementProductIds.join("\n") ?? "",
    sources:
      product?.sources.map((source) => ({
        label: source.label,
        url: source.url ?? "",
        note: source.note ?? "",
      })) ?? [],
    priceCopText: product?.priceCop == null ? "" : String(product.priceCop),
    verified: Boolean(product?.verifiedAt),
  };
}

export function toProductInput(values: ProductFormValues, product?: EditableProduct): ProductInput {
  return {
    sku: values.sku.trim() || undefined,
    name: values.name,
    brand: values.brand,
    category: values.category,
    presentation: values.presentation,
    format: values.format,
    imageUrl: values.imageUrl.trim() || undefined,
    description: values.description,
    activeIngredients: values.activeIngredients.map((ingredient) => ({
      name: ingredient.name,
      verified: ingredient.verified,
      // Un texto vacio es "sin dato", no un cero.
      amount_per_serving:
        ingredient.amountText.trim() === "" ? undefined : Number(ingredient.amountText),
      unit: ingredient.unit.trim() || undefined,
    })),
    benefits: values.benefits.map((benefit, index) => ({ ...benefit, rank: index + 1 })),
    faqs: values.faqs,
    objections: values.objections,
    differentiators: values.differentiators,
    precautions: values.precautions,
    claimsAllowed: lines(values.claimsAllowedText),
    claimsCaution: lines(values.claimsCautionText),
    claimsForbidden: lines(values.claimsForbiddenText),
    complementProductIds: lines(values.complementProductIdsText),
    sources: values.sources.map((source) => ({
      label: source.label,
      url: source.url.trim() || undefined,
      note: source.note.trim() || undefined,
    })),
    priceCop: values.priceCopText.trim() === "" ? undefined : Number(values.priceCopText),
    verifiedAt: values.verified ? (product?.verifiedAt ?? new Date()) : null,
  } as ProductInput;
}
