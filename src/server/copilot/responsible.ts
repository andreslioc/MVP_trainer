import type { products } from "../../db/schema.ts";
import type { CopilotComposition } from "../../lib/ai/schemas.ts";
import { productKnowledgeForPrompt } from "../../lib/ai/prompts/generate-questions.ts";

export type ResponsibleAlert = { code: string; message: string };

type ResponsibleInput = {
  question: string;
  composition: CopilotComposition;
  product: typeof products.$inferSelect;
  refusal?: boolean;
  /**
   * Descuento vigente en la sesion de live, si hay precio especial activo.
   *
   * El gate prohibe cualquier porcentaje que no este en la ficha, porque
   * inventar una cifra de eficacia es el fallo que existe para evitar. Un
   * descuento tambien es un porcentaje, y desde que vive en la sesion y no en
   * la ficha, el gate lo leia como evidencia inventada y bloqueaba la respuesta
   * entera. Se pasa aparte para poder distinguirlos: se acepta ESE numero, no
   * los porcentajes en general.
   */
  promoPercent?: number | null;
};

export type ResponsibleResult =
  | {
      ok: true;
      data: { composition: CopilotComposition; alerts: ResponsibleAlert[] };
    }
  | {
      ok: false;
      error: {
        code: "RESPONSIBLE_CONTENT_BLOCKED";
        message: string;
        alerts: ResponsibleAlert[];
      };
    };

const healthRiskPattern =
  /\b(embaraz(?:o|ada)|gestaci[oó]n|lactancia|amamantando|medicamento|medicina|f[aá]rmaco|enfermedad|diagn[oó]stic[oa]|diabetes|hipertensi[oó]n|c[aá]ncer|alergia|cirug[ií]a|riesgo de salud)\b/i;
const therapeuticClaimPattern =
  /\b(cura|curar|trata|tratar|previene|prevenir|sana|sanar|elimina|reversa|revertir)\b.{0,80}\b(enfermedad|diabetes|hipertensi[oó]n|c[aá]ncer|depresi[oó]n|ansiedad|infecci[oó]n|dolor|diagn[oó]stico|s[ií]ntoma)/i;
const unsupportedEvidencePattern =
  /\b(aprobado por (?:la )?fda|certificad[oa]|cl[ií]nicamente probado|estudios? (?:demuestran|comprueban)|\d+(?:[.,]\d+)?\s*%)/i;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

/**
 * El porcentaje encontrado es exactamente el descuento de esta sesion.
 *
 * Se compara el numero, no la cadena: "10 %", "10%" y "10 por ciento" son el
 * mismo descuento escrito distinto, y un 95% sigue estando prohibido aunque el
 * descuento sea del 10.
 */
function isSessionDiscount(match: string, promoPercent: number | null) {
  if (promoPercent === null) return false;
  const digits = match.match(/\d+(?:[.,]\d+)?/)?.[0];
  if (digits === undefined) return false;
  return Number(digits.replace(",", ".")) === promoPercent;
}

function answerText(composition: CopilotComposition) {
  return [composition.express, composition.estandar, composition.profunda].join(" ");
}

function safeCautionComposition(
  composition: CopilotComposition,
  refusal: boolean,
): CopilotComposition {
  const answer = refusal
    ? "No puedo confirmar una recomendación con la información disponible. Para actuar con seguridad, revisa la ficha del producto y consulta con un profesional de salud."
    : "No es responsable recomendar este producto de forma afirmativa en esta situación. Consulta con un profesional de salud antes de usarlo y revisa la ficha del producto.";
  return {
    intent: composition.intent,
    express: answer,
    estandar: answer,
    profunda: answer,
    confidence: "revisar",
    cta_used: null,
    rule_applied: null,
  };
}

function blocked(alert: ResponsibleAlert): ResponsibleResult {
  return {
    ok: false,
    error: {
      code: "RESPONSIBLE_CONTENT_BLOCKED",
      message: alert.message,
      alerts: [alert],
    },
  };
}

export function applyResponsibleCommunication(input: ResponsibleInput): ResponsibleResult {
  if (input.refusal) {
    const alert = {
      code: "AI_REFUSAL",
      message: "El proveedor rechazó la respuesta; se aplicó una recomendación segura.",
    };
    return {
      ok: true,
      data: {
        composition: safeCautionComposition(input.composition, true),
        alerts: [alert],
      },
    };
  }

  if (healthRiskPattern.test(input.question)) {
    const alert = {
      code: "HEALTH_CAUTION",
      message: "La consulta requiere precaución y valoración de un profesional de salud.",
    };
    return {
      ok: true,
      data: {
        composition: safeCautionComposition(input.composition, false),
        alerts: [alert],
      },
    };
  }

  const combined = answerText(input.composition);
  const normalizedCombined = normalize(combined);
  const forbiddenClaim = input.product.claimsForbidden.find((claim) =>
    normalizedCombined.includes(normalize(claim)),
  );
  if (forbiddenClaim) {
    return blocked({
      code: "PROHIBITED_CLAIM",
      message: `Afirmación prohibida detectada: ${forbiddenClaim}`,
    });
  }
  if (therapeuticClaimPattern.test(combined)) {
    return blocked({
      code: "THERAPEUTIC_CLAIM",
      message: "Se bloqueó una afirmación terapéutica no permitida.",
    });
  }

  // Evalua solo el conocimiento que puede recibir el modelo. SKU e imagen se
  // quedan como metadatos administrativos y no respaldan una respuesta.
  const productKnowledge = normalize(JSON.stringify(productKnowledgeForPrompt(input.product)));
  const unsupportedEvidence = combined.match(unsupportedEvidencePattern)?.[0];
  if (
    unsupportedEvidence &&
    !productKnowledge.includes(normalize(unsupportedEvidence)) &&
    !isSessionDiscount(unsupportedEvidence, input.promoPercent ?? null)
  ) {
    return blocked({
      code: "UNVERIFIED_CLAIM",
      message: `La evidencia mencionada no está respaldada por la ficha: ${unsupportedEvidence}`,
    });
  }

  const alerts: ResponsibleAlert[] = [];
  let confidence = input.composition.confidence;
  const cautionClaim = input.product.claimsCaution.find((claim) =>
    normalizedCombined.includes(normalize(claim)),
  );
  if (cautionClaim) {
    confidence = "revisar";
    alerts.push({
      code: "CAUTION_CLAIM",
      message: `La afirmación requiere cautela: ${cautionClaim}`,
    });
  }

  const hasStrongProductEvidence =
    input.product.verifiedAt !== null && input.product.sources.length > 0;
  if (confidence === "alto" && !hasStrongProductEvidence) {
    confidence = "medio";
    alerts.push({
      code: "EVIDENCE_LIMITED",
      message: "La verificación o las fuentes disponibles no permiten confianza alta.",
    });
  }

  return {
    ok: true,
    data: {
      composition: { ...input.composition, confidence },
      alerts,
    },
  };
}
