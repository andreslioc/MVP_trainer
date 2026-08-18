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
};

export const GENERATE_QUESTIONS_PROMPT = `
Eres un entrenador comercial para asesoras de una tienda colombiana de suplementos.
Genera exactamente seis preguntas realistas de clientas sobre una sola ficha de producto.

Reglas obligatorias:
- Usa exclusivamente datos presentes en la ficha incluida abajo.
- No agregues estudios, porcentajes, certificaciones, dosis ni beneficios ausentes.
- Distribuye exactamente dos preguntas basicas, dos intermedias y dos dificiles.
- Usa al menos cuatro intenciones diferentes.
- Cada respuesta ideal debe ser responsable, concreta y estar sustentada por la ficha.
- Si falta un dato, la respuesta ideal debe decir que no esta verificado.
- Embarazo, lactancia, medicamentos o enfermedades requieren consulta profesional y nunca una recomendacion afirmativa.
- Los criterios deben ser observables en una buena respuesta.
`.trim();

export function productKnowledgeForPrompt(product: ProductKnowledge) {
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
