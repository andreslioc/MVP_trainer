import type { products } from "../../db/schema.ts";
import type { CopilotComposition } from "../../lib/ai/schemas.ts";
import { productKnowledgeForPrompt } from "../../lib/ai/prompts/generate-questions.ts";
import { findJargon } from "../../lib/camera-register.ts";
import { findEmptyPhrase } from "../../lib/vague-claims.ts";

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
  /**
   * Que se esta validando.
   *
   * `live` es una respuesta que va a decirse ahora: si la PREGUNTA toca
   * embarazo, medicamentos o enfermedad, la respuesta se reemplaza por la ruta
   * de cautela, porque en camara no hay tiempo de matizar.
   *
   * `teaching` es la version mejorada del Simulator. Ahi la pregunta de riesgo
   * es justamente el ejercicio: sustituir la respuesta por la frase enlatada le
   * enseña a la asesora a recitarla en vez de a responder bien. Se validan las
   * afirmaciones del texto —lo que si se bloquea— y no se toca su contenido.
   */
  mode?: "live" | "teaching";
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
/**
 * Peso, grasa y transformacion corporal — la regla que tumba cuentas.
 *
 * Se bloquea el VERBO con su objeto, no el sustantivo: "quemador de grasa" es
 * el tipo de producto y nombrarlo es un hecho de la etiqueta; "te ayuda a
 * quemar grasa" es la promesa que TikTok castiga. Por eso el patron exige una
 * forma verbal —y `quemador` no la activa, porque no hay limite de palabra
 * despues de "quema".
 */
const bodyTransformationPattern =
  /\b(?:quem(?:a|ar|as|ando|en)|gan(?:a|ar|as|es)|aument(?:a|ar|as)|baj(?:a|ar|as|es)|pierd(?:e|es|as)|perder|adelgaz(?:a|ar|as|es)|reduc(?:e|ir|es|en)|elimin(?:a|ar|as)|derret(?:e|ir)|tonific(?:a|ar)|defin(?:e|ir))\b[^.;]{0,40}\b(grasa|peso|kilos|libras|barriga|abdomen|medidas|talla|celulitis|m[uú]sculo|masa muscular)\b/i;
const bodyOutcomePattern =
  /\b(p[eé]rdida de peso|baja de peso|d[eé]ficit cal[oó]rico|deficit calorico|reducci[oó]n de (?:grasa|peso|medidas)|aumento de (?:masa )?muscular|ganancia muscular|transforma(?:r|cion|ci[oó]n)? (?:tu |el )?cuerpo|cambio f[ií]sico)\b/i;

/**
 * Promesas de resultado. Un suplemento no garantiza nada, y un plazo inventado
 * —"en dos semanas"— es la version con calendario de la misma promesa.
 */
const guaranteedResultPattern =
  /\b(resultados? (?:garantizad[oa]s?|asegurad[oa]s?|r[aá]pid[oa]s?|inmediat[oa]s?|visibles en)|efecto milagroso|100\s*%\s*efectivo|funciona para todos|te va a funcionar|garantiza(?:mos|do)? (?:que|resultados))\b/i;

/**
 * Calidad, autenticidad y superioridad que nadie puede demostrar.
 *
 * "Te garantizamos calidad en cada gota" y "es el mejor del mercado" no salen
 * de ninguna ficha: las escribe el modelo para sonar a vendedor. Son el §9 y el
 * §10 del reglamento de live —comparaciones y originalidad— y hasta ahora no
 * las miraba nadie.
 */
const unverifiableQualityPattern =
  /\b(?:garantiza(?:mos|do|da|dos|das)?|aseguramos|asegurado)\s+(?:la\s+|el\s+|su\s+|tu\s+)?(?:calidad|pureza|originalidad|autenticidad|efectividad|eficacia)\b|\b100\s*%\s*(?:original|puro|autentico|aut[eé]ntico)\b|\b(?:el|la)\s+(?:mejor|n[uú]mero\s+uno)\s+(?:del\s+mercado|producto|suplemento|opci[oó]n|marca)\b|\b(?:m[aá]s|mejor)\s+(?:efectivo|potente|eficaz)\s+que\b|\bes\s+superior\s+a\b/i;

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

/**
 * En cual de las tres vistas aparece el hallazgo.
 *
 * Los bloqueos miran las tres juntas —la asesora puede cambiar de vista y decir
 * cualquiera—, pero una alerta de calidad que no dice donde esta el problema le
 * pide regenerar una respuesta que se ve bien: la palabra estaba en la profunda
 * y ella esta leyendo la express.
 */
function whereItAppears(composition: CopilotComposition, needle: string) {
  const found = (["express", "estandar", "profunda"] as const).filter((variant) =>
    normalize(composition[variant]).includes(normalize(needle)),
  );
  if (found.length === 3) return "las tres vistas";
  if (found.length === 0) return "la respuesta";
  return found.length === 1 ? `la vista ${found[0]}` : `las vistas ${found.join(" y ")}`;
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

  if (input.mode !== "teaching" && healthRiskPattern.test(input.question)) {
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
  const bodyClaim =
    combined.match(bodyTransformationPattern)?.[0] ?? combined.match(bodyOutcomePattern)?.[0];
  if (bodyClaim) {
    return blocked({
      code: "BODY_TRANSFORMATION_CLAIM",
      message: `Afirmación sobre peso o composición corporal: ${bodyClaim.trim()}`,
    });
  }
  const qualityClaim = combined.match(unverifiableQualityPattern)?.[0];
  if (qualityClaim) {
    return blocked({
      code: "UNVERIFIABLE_QUALITY_CLAIM",
      message: `Calidad, autenticidad o superioridad que no se puede demostrar: ${qualityClaim.trim()}`,
    });
  }
  const guaranteedResult = combined.match(guaranteedResultPattern)?.[0];
  if (guaranteedResult) {
    return blocked({
      code: "GUARANTEED_RESULT_CLAIM",
      message: `Promesa de resultado no permitida: ${guaranteedResult.trim()}`,
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

  // El prompt pide traducir las palabras de etiqueta, y a veces no lo hace: la
  // express decia "base para diluirlo" y la estandar, del mismo tirón, "el
  // vehículo". Alerta y no bloqueo: la respuesta es correcta, suena a farmacia.
  const jargon = findJargon(combined);
  if (jargon) {
    alerts.push({
      code: "JARGON_IN_ANSWER",
      message: `"${jargon}" es palabra de etiqueta, no de una clienta, y aparece en ${whereItAppears(input.composition, jargon)}.`,
    });
  }

  const emptyPhrase = findEmptyPhrase(combined);
  if (emptyPhrase) {
    alerts.push({
      code: "VAGUE_ANSWER",
      message: `Promete variedad sin nombrarla —"${emptyPhrase}"— en ${whereItAppears(input.composition, emptyPhrase)}.`,
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
