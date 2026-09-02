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
      z
        .object({
          claim: z.string(),
          science_note: z.string(),
          evidence_level: z.enum(["alta", "media", "baja"]),
          technical_note: z.string(),
        })
        .refine((benefit) => benefit.claim.trim() === "" || benefit.science_note.trim() !== "", {
          message: "Un beneficio con frase necesita su porque.",
          path: ["science_note"],
        }),
    )
    .length(3),
  // Tres ranuras en pantalla, pero una ficha puede tener uno o dos beneficios
  // reales. Las vacias se descartan al guardar en vez de obligar a rellenarlas.
  faqs: z.array(z.object({ question: required, answer: required })),
  objections: z.array(z.object({ objection: required, response: required })),
  differentiators: z.array(z.object({ claim: required, evidence: required })),
  purpose: z.string(),
  audience: z.string(),
  subcategory: z.string(),
  liveReadyText: z.string(),
  /**
   * La Respuesta Completa, un campo por bloque.
   *
   * Nueve textos y no un solo textarea: el valor del campo esta en la
   * estructura, y un cuadro grande produce un parrafo sin orden que nadie puede
   * recortar despues por bloques.
   */
  fullAnswer: z.object({
    what_it_is: z.string(),
    what_for: z.string(),
    benefits: z.string(),
    science: z.string(),
    different: z.string(),
    trust: z.string(),
    commercial: z.string(),
    cta: z.string(),
    warning: z.string(),
  }),
  keywordsText: z.string(),
  vsSimilares: z.array(z.object({ reference: required, difference: required })),
  verificationGapsText: z.string(),
  usageMode: z.string(),
  precautions: z.string(),
  contraindicationsText: z.string(),
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
    benefits: product?.benefits.map(({ claim, science_note, evidence_level, technical_note }) => ({
      technical_note: technical_note ?? "",
      claim,
      science_note,
      evidence_level,
    })) ?? [
      { claim: "", science_note: "", evidence_level: "media", technical_note: "" },
      { claim: "", science_note: "", evidence_level: "media", technical_note: "" },
      { claim: "", science_note: "", evidence_level: "media", technical_note: "" },
    ],
    faqs: product?.faqs.map(({ question, answer }) => ({ question, answer })) ?? [],
    objections:
      product?.objections.map(({ objection, response }) => ({ objection, response })) ?? [],
    differentiators:
      product?.differentiators.map(({ claim, evidence }) => ({ claim, evidence })) ?? [],
    purpose: product?.purpose ?? "",
    audience: product?.audience ?? "",
    subcategory: product?.subcategory ?? "",
    liveReadyText: product?.liveReady.join("\n") ?? "",
    fullAnswer: {
      what_it_is: product?.fullAnswer?.what_it_is ?? "",
      what_for: product?.fullAnswer?.what_for ?? "",
      benefits: product?.fullAnswer?.benefits ?? "",
      science: product?.fullAnswer?.science ?? "",
      different: product?.fullAnswer?.different ?? "",
      trust: product?.fullAnswer?.trust ?? "",
      commercial: product?.fullAnswer?.commercial ?? "",
      cta: product?.fullAnswer?.cta ?? "",
      warning: product?.fullAnswer?.warning ?? "",
    },
    keywordsText: product?.keywords.join("\n") ?? "",
    vsSimilares:
      product?.vsSimilares.map(({ reference, difference }) => ({ reference, difference })) ?? [],
    verificationGapsText: product?.verificationGaps.join("\n") ?? "",
    usageMode: product?.usageMode ?? "",
    precautions: product?.precautions ?? "",
    contraindicationsText: product?.contraindications.join("\n") ?? "",
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

/**
 * Los nueve bloques a lo que guarda la ficha, o nulo si estan todos vacios.
 *
 * Vacio es NULO y no un objeto de cadenas vacias: la ficha distingue "no tiene
 * respuesta modelo todavia" de "tiene una y esta en blanco", y el validador
 * exige los ocho bloques cuando el campo existe.
 */
function toFullAnswer(values: ProductFormValues["fullAnswer"]) {
  const blocks = Object.values(values).map((value) => value.trim());
  if (blocks.every((value) => value === "")) return null;
  const warning = values.warning.trim();
  return {
    what_it_is: values.what_it_is,
    what_for: values.what_for,
    benefits: values.benefits,
    science: values.science,
    different: values.different,
    trust: values.trust,
    commercial: values.commercial,
    cta: values.cta,
    ...(warning === "" ? {} : { warning }),
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
    benefits: values.benefits
      .filter((benefit) => benefit.claim.trim() !== "")
      .map((benefit, index) => ({ ...benefit, rank: index + 1 })),
    faqs: values.faqs,
    objections: values.objections,
    differentiators: values.differentiators,
    purpose: values.purpose,
    audience: values.audience,
    subcategory: values.subcategory,
    liveReady: lines(values.liveReadyText),
    keywords: lines(values.keywordsText),
    vsSimilares: values.vsSimilares,
    verificationGaps: lines(values.verificationGapsText),
    usageMode: values.usageMode,
    precautions: values.precautions,
    contraindications: lines(values.contraindicationsText),
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
    fullAnswer: toFullAnswer(values.fullAnswer),
    // Campos que la ficha tiene y este formulario NO muestra: se arrastran del
    // producto que se esta editando.
    //
    // Sin estas tres lineas el guardado los pone en su valor por defecto y los
    // borra en silencio. Paso de verdad: verificar una ficha desde el Hub le
    // quito el resumen para la asesora, la guia de cautela y los casos de no
    // uso, sin un solo mensaje de error. Cualquier campo nuevo que se agregue a
    // la ficha y no al formulario tiene que sumarse aqui.
    advisorSummary: product?.advisorSummary ?? "",
    cautionGuidance: product?.cautionGuidance ?? [],
    avoidGuidance: product?.avoidGuidance ?? [],
  } as ProductInput;
}
