import type { ResearchedProduct } from "./ai/schemas.ts";

/**
 * Traduce una investigacion con busqueda web al contrato de una ficha.
 *
 * Es una funcion pura y separada de la llamada al modelo porque aqui viven las
 * decisiones que no se le delegan al proveedor: que nivel de evidencia se
 * admite, de donde salen las fuentes y que frases estan prohibidas siempre.
 */

/**
 * Las cuatro prohibiciones que toda ficha lleva, la investigue quien la
 * investigue. No se le preguntan al modelo: son la regla del negocio.
 */
export const CANONICAL_FORBIDDEN_CLAIMS = [
  "Cura enfermedades",
  "Trata enfermedades",
  "Previene enfermedades",
  "Garantiza resultados",
];

export type ResearchCitation = { url: string; title: string };

function ingredientLabel(ingredient: ResearchedProduct["active_ingredients"][number]) {
  return ingredient.declared_amount
    ? `${ingredient.name} — ${ingredient.declared_amount} declarados`
    : ingredient.name;
}

export function researchToProductPatch(research: ResearchedProduct, citations: ResearchCitation[]) {
  return {
    name: research.name,
    brand: research.brand,
    presentation: research.presentation,
    format: research.format,
    description: research.description,
    // `verified: false` sin excepcion: una busqueda automatica encontro el dato,
    // pero nadie del equipo lo ha mirado. El esquema de producto prohibe una
    // cantidad numerica sin verificar, y por eso la cantidad viaja en el nombre,
    // como lo que es: lo que dice la etiqueta segun la busqueda.
    activeIngredients: research.active_ingredients.map((ingredient) => ({
      name: ingredientLabel(ingredient),
      verified: false,
    })),
    // Evidencia "baja" en los tres, siempre. Nada que no haya pasado por una
    // revision humana puede presentarse como evidencia alta en camara.
    benefits: research.benefits.map((benefit, index) => ({
      rank: index + 1,
      claim: benefit.claim,
      science_note: benefit.science_note,
      evidence_level: "baja" as const,
    })),
    faqs: research.faqs,
    objections: research.objections,
    differentiators: research.differentiators,
    usageMode: research.usage_mode,
    contraindications: research.contraindications,
    precautions: research.precautions,
    claimsAllowed: research.claims_allowed,
    claimsCaution: [
      ...research.claims_caution,
      ...research.unconfirmed.map((item) => `Sin confirmar en la busqueda: ${item}`),
      "Ficha armada con busqueda automatica; requiere revision humana antes de un live.",
    ],
    claimsForbidden: CANONICAL_FORBIDDEN_CLAIMS,
    // Las fuentes son las que reporto el buscador del proveedor, no las que el
    // modelo escribio en su texto: una URL redactada puede no existir.
    sources: citations.map((citation) => ({
      label: citation.title.slice(0, 200),
      url: citation.url,
      note: "Abierta durante la investigacion automatica; pendiente de revision humana.",
    })),
    // La investigacion nunca deja una ficha verificada. Regenerar el contenido
    // de una ficha ya verificada la devuelve a "por verificar", y eso es
    // intencional: el contenido que alguien aprobo ya no es el que esta.
    verifiedAt: null,
  };
}
