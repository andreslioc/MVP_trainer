import { z } from "zod";

import {
  CLAIM_MAX_WORDS,
  CLAIM_TARGET_WORDS,
  countWords,
  findJargon,
  findProvenance,
} from "../camera-register.ts";
import { findEmptyPhrase, isAllGeneric, isOnlyPackaging } from "../vague-claims.ts";

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

export const productBenefitSchema = z
  .object({
    rank: z.number().int().min(1).max(3),
    claim: requiredText,
    science_note: requiredText,
    evidence_level: z.enum(["alta", "media", "baja"]),
    technical_note: optionalText,
  })
  .superRefine((benefit, context) => {
    // Registro de camara: `claim` y `science_note` los lee la asesora al aire;
    // `technical_note` no. La jerga se rechaza en los dos primeros y se permite
    // en el tercero, que es justo el lugar que se creo para ella.
    if (countWords(benefit.claim) > CLAIM_MAX_WORDS) {
      context.addIssue({
        code: "custom",
        message: `La frase que se dice en camara no puede pasar de ${CLAIM_MAX_WORDS} palabras; apunta a ${CLAIM_TARGET_WORDS}.`,
        path: ["claim"],
      });
    }
    for (const field of ["claim", "science_note"] as const) {
      const jargon = findJargon(benefit[field]);
      if (jargon) {
        context.addIssue({
          code: "custom",
          message: `"${jargon}" no se dice en camara. Ese dato va en el respaldo tecnico.`,
          path: [field],
        });
      }
      // Concrecion: la seguridad sola empuja a la frase que no afirma nada, y
      // "apoya diversos objetivos de salud" pasa todos los filtros sin decir
      // nada. Un beneficio tiene que nombrar algo que se pueda señalar.
      const emptyPhrase = findEmptyPhrase(benefit[field]);
      if (emptyPhrase) {
        context.addIssue({
          code: "custom",
          message: `"${emptyPhrase}" no dice nada. Nombra cual: el ingrediente, la cantidad, la parte del cuerpo o la situacion de uso.`,
          path: [field],
        });
      }
    }
    if (isAllGeneric(benefit.claim)) {
      context.addIssue({
        code: "custom",
        message: `Este beneficio solo tiene palabras genericas: "${benefit.claim}". Si al leerlo cabe preguntar «¿como cual?», no es un beneficio.`,
        path: ["claim"],
      });
    }
    // El error contrario, y se cae en el huyendo de la vaguedad: un dato de
    // etiqueta ocupando el espacio del beneficio. El rendimiento va en los
    // diferenciales, la cantidad en los ingredientes y el manejo en el modo de
    // uso. Aqui va lo que el producto hace por la persona.
    if (isOnlyPackaging(benefit.claim)) {
      context.addIssue({
        code: "custom",
        message: `Esto es un dato de envase, cantidad o manejo, no un beneficio: "${benefit.claim}". El rendimiento va en diferenciales y la dosis en modo de uso; aqui va que hace por la persona.`,
        path: ["claim"],
      });
    }
  });

const sourceSchema = z.object({
  label: requiredText,
  url: optionalUrl,
  note: optionalText,
});

export const productInputSchema = z
  .object({
    sku: optionalText,
    name: requiredText,
    brand: requiredText,
    category: requiredText,
    presentation: requiredText,
    format: requiredText,
    imageUrl: optionalUrl,
    description: z.string().trim(),
    purpose: z
      .string()
      .trim()
      .refine((value) => value === "" || findEmptyPhrase(value) === null, {
        message:
          "El para que sirve no puede prometer variedad sin nombrarla: di para que exactamente.",
      })
      .default(""),
    audience: z.string().trim().default(""),
    subcategory: z.string().trim().default(""),
    // Son las frases que salen por la boca: pasan por el mismo registro de
    // camara que la frase de un beneficio.
    liveReady: z
      .array(
        requiredText
          .refine((line) => findJargon(line) === null, {
            message: "Esta frase se dice al aire: la jerga tecnica no puede aparecer aqui.",
          })
          .refine((line) => findEmptyPhrase(line) === null && !isAllGeneric(line), {
            message: "Esta frase no dice nada concreto: nombra el dato que la sostiene.",
          }),
      )
      // Ocho, no seis: es lo que produce la capa de seguridad —su contrato es
      // min(3).max(8)— y el limite de seis lo puse a ojo. Dos esquemas nuestros
      // en desacuerdo rechazaban fichas correctas.
      .max(8, "Mas de ocho frases no se recuerdan en camara.")
      .default([]),
    keywords: z.array(requiredText).default([]),
    vsSimilares: z
      .array(z.object({ reference: requiredText, difference: requiredText }))
      .default([]),
    verificationGaps: z.array(requiredText).default([]),
    cautionGuidance: z
      .array(
        z.object({
          claim: requiredText,
          reason: requiredText,
          // La forma segura pasa por el registro de camara: se dice tal cual.
          safe_form: requiredText.refine((line) => findJargon(line) === null, {
            message: "Esta frase se dice al aire: la jerga tecnica no puede aparecer aqui.",
          }),
        }),
      )
      .default([]),
    avoidGuidance: z
      .array(
        z.object({ avoid: requiredText, reason: requiredText, alternative: z.string().trim() }),
      )
      .default([]),
    advisorSummary: z.string().trim().default(""),
    activeIngredients: z.array(activeIngredientSchema),
    benefits: z
      .array(productBenefitSchema)
      // Uno a tres y no exactamente tres: forzar el tercero es como se llena el
      // hueco con un dato de envase o con una frase vacia. Un producto con dos
      // beneficios reales tiene dos.
      .min(1, "La ficha necesita al menos un beneficio.")
      .max(3, "Maximo tres beneficios priorizados."),
    faqs: z.array(z.object({ question: requiredText, answer: requiredText })),
    objections: z.array(z.object({ objection: requiredText, response: requiredText })),
    differentiators: z.array(z.object({ claim: requiredText, evidence: requiredText })),
    usageMode: z.string().trim(),
    precautions: z.string().trim(),
    contraindications: z.array(requiredText),
    claimsAllowed: z.array(requiredText),
    claimsCaution: z.array(requiredText),
    claimsForbidden: z.array(requiredText),
    complementProductIds: z.array(z.uuid()).max(3),
    sources: z.array(sourceSchema),
    verifiedAt: z.coerce.date().nullable().optional(),
    // Pesos colombianos sin decimales: nadie cobra centavos en un live.
    priceCop: z.preprocess(
      (value) => (value === "" || value === null ? undefined : value),
      z.coerce
        .number()
        .int("El precio va en pesos, sin decimales.")
        .positive()
        .nullable()
        .default(null),
    ),
  })
  .superRefine((product, context) => {
    // Registro de camara en TODO lo que la asesora lee al aire, no solo en los
    // beneficios: "vehiculo" llego a una respuesta desde `contraindications`,
    // que nadie estaba mirando. Quedan fuera `technical_note` —creado para la
    // jerga—, `claims_caution` —lista de terminos gatillo— y
    // `verification_gaps`, que es nota interna.
    const cameraFields: Array<[string, string]> = [
      ["description", product.description],
      ["purpose", product.purpose],
      ["audience", product.audience],
      ["usageMode", product.usageMode],
      ["precautions", product.precautions],
      ...product.contraindications.map(
        (item, index) => [`contraindications.${index}`, item] as [string, string],
      ),
      ...product.claimsAllowed.map(
        (item, index) => [`claimsAllowed.${index}`, item] as [string, string],
      ),
      ...product.faqs.map(
        (item, index) => [`faqs.${index}.answer`, item.answer] as [string, string],
      ),
      ...product.objections.map(
        (item, index) => [`objections.${index}.response`, item.response] as [string, string],
      ),
      ...product.differentiators.flatMap(
        (item, index) =>
          [
            [`differentiators.${index}.claim`, item.claim],
            [`differentiators.${index}.evidence`, item.evidence],
          ] as Array<[string, string]>,
      ),
      ...product.vsSimilares.map(
        (item, index) => [`vsSimilares.${index}.difference`, item.difference] as [string, string],
      ),
      ...product.activeIngredients.map(
        (item, index) => [`activeIngredients.${index}.name`, item.name] as [string, string],
      ),
    ];
    // La trazabilidad se guarda, no se dice: solo en los campos que describen y
    // venden. Las precauciones y los casos de no uso quedan fuera a proposito,
    // porque ahi nombrar la etiqueta suma autoridad.
    const spokenFields: Array<[string, string]> = [
      ["description", product.description],
      ["purpose", product.purpose],
      ...product.benefits.map(
        (item, index) => [`benefits.${index}.claim`, item.claim] as [string, string],
      ),
      ...product.liveReady.map((item, index) => [`liveReady.${index}`, item] as [string, string]),
      ...product.cautionGuidance.map(
        (item, index) => [`cautionGuidance.${index}.safe_form`, item.safe_form] as [string, string],
      ),
    ];
    for (const [path, value] of spokenFields) {
      const provenance = findProvenance(value);
      if (provenance) {
        context.addIssue({
          code: "custom",
          message: `"${provenance}" es trazabilidad, no algo que se diga en camara. Va en el respaldo tecnico o en los datos sin confirmar; aqui va el dato de frente.`,
          path: path.split("."),
        });
      }
    }

    for (const [path, value] of cameraFields) {
      const jargon = findJargon(value);
      if (jargon) {
        context.addIssue({
          code: "custom",
          message: `"${jargon}" es palabra de etiqueta y esto se lee en camara. Dilo como se lo dirias a una clienta.`,
          path: path.split("."),
        });
      }
    }

    const ranks = new Set(product.benefits.map((benefit) => benefit.rank));
    const expected = product.benefits.map((_, index) => index + 1);
    if (ranks.size !== product.benefits.length || !expected.every((rank) => ranks.has(rank))) {
      context.addIssue({
        code: "custom",
        message: `Los beneficios deben usar los rangos ${expected.join(", ")} una sola vez.`,
        path: ["benefits"],
      });
    }

    // Verificar una ficha sin precio la deja sin poder responder la pregunta
    // mas frecuente de un live: 108 de 250 en el live medido.
    if (product.verifiedAt && product.priceCop == null) {
      context.addIssue({
        code: "custom",
        message: "Carga el precio antes de marcar la ficha como verificada.",
        path: ["priceCop"],
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
