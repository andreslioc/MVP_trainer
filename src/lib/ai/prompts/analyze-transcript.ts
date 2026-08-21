/**
 * Prompt y redaccion de PII para el analisis de una grabacion de live.
 *
 * El riesgo de PII del blueprint (§20) es concreto: en el chat de un live las
 * clientas dicen nombres, telefonos y condiciones de salud. Ese texto entra
 * aqui y sale convertido en material de entrenamiento, asi que la redaccion se
 * aplica DOS veces: sobre la transcripcion antes de que el modelo la vea, y
 * sobre cada insight antes de persistirlo. Una sola de las dos no alcanza.
 */

export const REDACTION_TOKENS = Object.freeze({
  phone: "[telefono]",
  email: "[correo]",
  name: "[nombre]",
});

/** Correos completos. */
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g;

/**
 * Telefonos colombianos: moviles de 10 cifras, fijos de 7, con o sin indicativo
 * +57, y con espacios, puntos o guiones intercalados.
 */
const PHONE = /(?:\+?57[\s.-]*)?\d(?:[\s.-]?\d){6,13}/g;

/**
 * Un precio no es un telefono. Un monto en pesos de seis o siete cifras debe
 * sobrevivir; "300 123 4567" y "+57 3001234567" no. La regla: diez o mas
 * digitos siempre, y de siete a nueve solo cuando vienen separados o con
 * indicativo, que es como se escribe un telefono y no como se escribe un monto.
 */
function isPhoneLike(match: string) {
  const digits = match.replace(/\D/g, "").length;
  if (digits < 7) return false;
  if (digits >= 10) return true;
  return /[\s.-]/.test(match) || match.trimStart().startsWith("+");
}

/** Nombre propio despues de una presentacion explicita. */
const SELF_INTRO =
  /\b(me llamo|mi nombre es|soy|habla con)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})?)/g;

/** Nombre propio despues de un vocativo o tratamiento. */
const VOCATIVE =
  /\b(hola|gracias|senora|senyora|señora|senor|señor|dona|doña|don)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})/g;

/**
 * Devuelve el texto sin identificadores directos. Idempotente: aplicarla dos
 * veces produce el mismo resultado, porque los tokens de reemplazo no vuelven a
 * coincidir con ningun patron.
 */
export function redactPii(text: string) {
  return text
    .replace(EMAIL, REDACTION_TOKENS.email)
    .replace(PHONE, (match) => (isPhoneLike(match) ? REDACTION_TOKENS.phone : match))
    .replace(SELF_INTRO, (_match, lead: string) => `${lead} ${REDACTION_TOKENS.name}`)
    .replace(VOCATIVE, (_match, lead: string) => `${lead} ${REDACTION_TOKENS.name}`);
}

/**
 * Queda algo legible una vez retirados los tokens de redaccion.
 *
 * Vive aqui, junto a `REDACTION_TOKENS`, porque la usan tanto los hallazgos
 * como la cobertura de chat: un mensaje que era solo un telefono queda solo
 * como token y no dice nada, y guardarlo seria una fila vacia con forma de dato.
 */
export function hasSubstance(text: string) {
  const withoutTokens = Object.values(REDACTION_TOKENS).reduce(
    (accumulator, token) => accumulator.split(token).join(" "),
    text,
  );
  return /\p{L}|\p{N}/u.test(withoutTokens);
}

/**
 * Puerta de salida. Un insight que todavia contiene un identificador directo no
 * se persiste: se descarta. Preferimos perder un insight a filtrar un telefono
 * hacia el material de entrenamiento.
 */
export function containsPii(text: string) {
  return redactPii(text) !== text;
}

export const ANALYZE_TRANSCRIPT_PROMPT = `
Eres analista comercial de una tienda colombiana de suplementos que vende por TikTok Live.
Recibes la transcripcion redactada de un live y devuelves insights accionables.

Tipos permitidos para insights, y solo estos seis:
- faq: una pregunta que las clientas repiten.
- objecion: una resistencia a comprar.
- error: una respuesta incorrecta, incompleta o sin sustento de la asesora.
- oportunidad: un momento donde faltaba un CTA, una venta cruzada o una aclaracion.
- buena_practica: una explicacion que funciono y conviene repetir.
- riesgo_claim: una afirmacion de salud que excede lo que la ficha permite.

Reglas obligatorias para insights:
- Usa exclusivamente lo que aparece en la transcripcion. No inventes preguntas que nadie hizo.
- NUNCA copies nombres propios, telefonos, correos ni direcciones al texto de un insight.
  La transcripcion ya viene redactada; si ves ${REDACTION_TOKENS.name} o ${REDACTION_TOKENS.phone}, no los reemplaces por nada.
- Redacta cada insight en tercera persona y de forma generalizable, no como cita literal.
- frequency es cuantas veces aparece el patron en esta transcripcion, minimo 1.
- product_id solo se llena con un id de la lista de productos entregada; si ninguno aplica, null.
- at_seconds es el segundo del live donde ocurre el hallazgo, copiado de la marca [Xs] de la linea
  correspondiente de la transcripcion. Sirve para que la asesora vaya a ese punto del video. Si la
  transcripcion no trae marcas, o el patron no se localiza en un punto concreto, null. No lo
  estimes ni lo deduzcas del orden de las lineas: o lo lees de una marca, o es null.
- Si la transcripcion no da para un tipo, simplemente no lo incluyas. Es preferible devolver pocos
  insights solidos a rellenar los seis tipos con material debil. Esta preferencia por lo breve
  aplica UNICAMENTE a los insights de esta lista y a nada mas.
`.trim();

export type AnalyzeTranscriptInput = {
  transcript: string;
  durationS: number | null;
  products: Array<{ id: string; name: string }>;
};

export function buildAnalyzeTranscriptPrompt(input: AnalyzeTranscriptInput) {
  const catalog = input.products.map((product) => ({ id: product.id, name: product.name }));
  const systemParts = [
    ANALYZE_TRANSCRIPT_PROMPT,
    `\n\nPRODUCTOS DISPONIBLES:\n${JSON.stringify(catalog)}`,
  ];

  const userContentParts = [
    `DURACION_SEGUNDOS: ${input.durationS ?? "desconocida"}`,
    "TRANSCRIPCION REDACTADA:",
    redactPii(input.transcript),
  ];

  return {
    system: systemParts.join("\n"),
    messages: [
      {
        role: "user" as const,
        content: userContentParts.join("\n"),
      },
    ],
  };
}
