import type { ResearchedBenefits, ResearchedProduct, SafetyLayer } from "./ai/schemas.ts";

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

/**
 * El nivel que va a la ficha, que no es siempre el que reporto el modelo.
 *
 * La pasada de beneficios SI califica la evidencia —para eso busca en fuentes de
 * evidencia—, pero "alta" se baja a "media" igual: nada que no haya pasado por
 * una revision humana se presenta como evidencia alta en camara, y esa regla no
 * cambia porque la fuente sea mejor. Un beneficio de la pasada de la etiqueta no
 * trae nivel y se queda en "baja".
 */
function nivelDeEvidencia(benefit: { claim: string; evidence_level?: "alta" | "media" | "baja" }) {
  // La pasada de la etiqueta no trae el campo, y por eso se lee asi: TypeScript
  // no lo ve en ese tipo, pero en tiempo de ejecucion la union es real.
  const nivel = "evidence_level" in benefit ? benefit.evidence_level : undefined;
  if (!nivel || nivel === "baja") return "baja" as const;
  return "media" as const;
}

export function researchToProductPatch(
  research: ResearchedProduct,
  citations: ResearchCitation[],
  /**
   * Salida de la capa de seguridad, o `null` cuando no corrio.
   *
   * Nulo no es lo mismo que vacio: una ficha sin clasificar se queda sin frases
   * para el live y sin guia de comunicacion, y asi se ve que falta el paso. Si
   * se llenaran con arreglos vacios pareceria que la capa dijo "no hay riesgo".
   */
  safety: SafetyLayer | null = null,
  /**
   * Salida del paso de beneficios, o `null` cuando no corrio.
   *
   * Cuando viene, MANDA sobre los beneficios del paso de la ficha: ese paso los
   * escribe mirando la etiqueta, y de ahi salian la dosis y el tipo de capsula.
   */
  benefits: ResearchedBenefits | null = null,
) {
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
    benefits: (benefits?.benefits ?? research.benefits).map((benefit, index) => ({
      rank: index + 1,
      claim: benefit.claim,
      science_note: benefit.science_note,
      ...("technical_note" in benefit && benefit.technical_note
        ? { technical_note: benefit.technical_note }
        : {}),
      evidence_level: nivelDeEvidencia(benefit),
    })),
    faqs: research.faqs,
    objections: research.objections,
    differentiators: research.differentiators,
    // La porcion y las porciones por envase se leen junto al modo de uso, que es
    // donde la asesora las busca; los alergenos van con las precauciones, que es
    // donde importan. Columnas propias solo cuando alguien las consulte aparte.
    usageMode: [
      research.usage_mode,
      research.serving_size ? `Porcion: ${research.serving_size}.` : "",
      research.servings_per_container ? `Rinde ${research.servings_per_container}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    contraindications: research.contraindications,
    precautions: research.allergens
      ? `${research.precautions} Alérgenos: ${research.allergens}.`.trim()
      : research.precautions,
    claimsAllowed: research.claims_allowed,
    claimsCaution: [
      ...research.claims_caution,
      ...(safety?.sensitive_terms ?? []),
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
    purpose: research.purpose,
    audience: research.audience,
    subcategory: research.subcategory,
    keywords: research.keywords
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean),
    vsSimilares: research.vs_similares,
    verificationGaps: research.unconfirmed,
    liveReady: safety?.live_ready ?? [],
    cautionGuidance: safety?.caution_guidance ?? [],
    avoidGuidance: safety?.avoid_guidance ?? [],
    advisorSummary: safety?.advisor_summary ?? "",
    // La investigacion nunca deja una ficha verificada. Regenerar el contenido
    // de una ficha ya verificada la devuelve a "por verificar", y eso es
    // intencional: el contenido que alguien aprobo ya no es el que esta.
    verifiedAt: null,
  };
}
