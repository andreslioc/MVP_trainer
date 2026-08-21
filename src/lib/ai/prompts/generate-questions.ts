import { formatCop, resolvePricing } from "../../pricing.ts";

type ProductKnowledge = {
  name: string;
  brand: string;
  category: string;
  presentation: string;
  format: string;
  activeIngredients: unknown;
  benefits: unknown;
  faqs: unknown;
  objections: unknown;
  differentiators: unknown;
  precautions: string;
  claimsAllowed: string[];
  claimsCaution: string[];
  claimsForbidden: string[];
  sources: unknown;
  verifiedAt?: Date | null;
  priceCop?: number | null;
};

export const GENERATE_QUESTIONS_PROMPT = `
Eres un entrenador comercial para asesoras de una tienda colombiana de suplementos.
Genera exactamente seis preguntas realistas de clientas sobre una sola ficha de producto.

Reglas obligatorias:
- Usa exclusivamente datos presentes en la ficha incluida abajo.
- No agregues estudios, porcentajes, certificaciones, dosis ni beneficios ausentes.
- Distribuye exactamente dos preguntas basicas, dos intermedias y dos dificiles.
- Usa al menos cuatro intenciones diferentes.
- Cada pregunta NOMBRA el producto, como lo hace una clienta en el chat de un live: "que precio
  tiene el max calm", "para q sirve el fenogreco". Una pregunta como "¿para que sirve?" a secas
  depende de ver el producto en camara, y fuera de ese momento no se puede responder.
- Cada respuesta ideal debe ser responsable, concreta y estar sustentada por la ficha.
- Si falta un dato, la respuesta ideal debe decir que no esta verificado.
- Embarazo, lactancia, medicamentos o enfermedades requieren consulta profesional y nunca una recomendacion afirmativa.
- Los criterios deben ser observables en una buena respuesta.
`.trim();

/**
 * `promoPercent` llega de la SESION de live, no de la ficha: el descuento se
 * prende en la pantalla del Copilot y muere con el live.
 *
 * El descuento se resuelve aqui, en codigo. El modelo recibe cifras hechas y
 * tiene prohibido calcular: multiplicar un precio por un porcentaje es justo el
 * tipo de operacion que un modelo falla de vez en cuando, y el error se dice en
 * camara.
 */
export function productKnowledgeForPrompt(
  product: ProductKnowledge,
  promoPercent: number | null = null,
) {
  const pricing = resolvePricing({
    priceCop: product.priceCop ?? null,
    promoActive: promoPercent !== null,
    promoPercent,
  });
  return {
    name: product.name,
    brand: product.brand,
    category: product.category,
    presentation: product.presentation,
    format: product.format,
    active_ingredients: product.activeIngredients,
    benefits: product.benefits,
    faqs: product.faqs,
    objections: product.objections,
    differentiators: product.differentiators,
    precautions: product.precautions,
    claims_allowed: product.claimsAllowed,
    claims_caution: product.claimsCaution,
    claims_forbidden: product.claimsForbidden,
    sources: product.sources,
    // Booleano y no la fecha: lo unico que la regla de confianza necesita saber
    // es si la ficha esta verificada, y una marca de tiempo invita al modelo a
    // razonar sobre lo vieja que es, que no es su trabajo.
    verified: Boolean(product.verifiedAt),
    // Formateado y no en crudo: pidiendole el numero pelado, el modelo unas
    // veces decia "161000" y otras "170.000". Un precio se lee en voz alta y
    // tiene que sonar igual siempre, asi que se entrega ya escrito.
    price: formatCop(pricing.priceCop),
    promo_price: formatCop(pricing.promoPriceCop),
    promo_percent: pricing.promoPercent,
  };
}

export function buildGenerateQuestionsPrompt(product: ProductKnowledge) {
  return {
    system: `${GENERATE_QUESTIONS_PROMPT}\n\nFICHA SELECCIONADA:\n${JSON.stringify(
      productKnowledgeForPrompt(product),
    )}`,
    messages: [
      {
        role: "user" as const,
        content: "Crea la tanda balanceada para practicar antes del live.",
      },
    ],
  };
}
