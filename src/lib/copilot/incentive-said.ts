/**
 * Un incentivo que no se dijo no cuenta como dicho.
 *
 * La composicion reporta `rule_applied`, y el codigo solo comprobaba que la
 * etiqueta coincidiera con la que entrego la orquestacion — nunca que la regla
 * apareciera de verdad en el texto. Resultado observado: la pantalla decia
 * "Regla aplicada: envio_gratis" y la respuesta no mencionaba el envio por
 * ningun lado.
 *
 * El daño no es la insignia. Ese incentivo se guarda en
 * `live_sessions.promos_mentioned`, asi que la rotacion cree que ya lo ofrecio
 * y deja de ofrecerlo el resto del live. Un incentivo que nadie escucho, quemado
 * para siempre.
 */

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es");
}

/**
 * Las formas en que un numero de pesos aparece dicho: con puntos, sin ellos, y
 * en miles. El umbral de 120000 se dice "$120.000" o "120 mil".
 */
function thresholdForms(threshold: number) {
  const plain = String(threshold);
  const dotted = threshold.toLocaleString("es-CO");
  const thousands = threshold % 1000 === 0 ? `${threshold / 1000} mil` : null;
  return [plain, dotted, thousands].filter((form): form is string => form !== null);
}

/**
 * `true` cuando el texto de la respuesta realmente menciona el incentivo.
 *
 * Se busca por el numero del umbral y por las palabras del mensaje configurado,
 * no por la clave de la regla: la clave es interna y jamas se dice en camara.
 * Un incentivo con umbral cuenta como dicho si aparece su cifra o si se dice
 * que ya esta cubierto —"el envio te sale gratis"—, que es la forma corta que
 * el prompt autoriza cuando el precio ya pasa el umbral.
 */
export function incentiveWasSaid(
  answer: string,
  incentive: { ruleKey: string; value: Record<string, unknown> } | null,
): boolean {
  if (!incentive) return false;
  const text = normalize(answer);

  const threshold = incentive.value.threshold_cop;
  if (typeof threshold === "number") {
    if (thresholdForms(threshold).some((form) => text.includes(normalize(form)))) return true;
    // Umbral ya cubierto: la condicion no se recita, pero el incentivo si se
    // nombra. Sin esto, la respuesta correcta contaria como no dicha.
    return text.includes("envio gratis") || text.includes("envio te sale gratis");
  }

  const message = incentive.value.message;
  if (typeof message === "string" && message.trim()) {
    // Las palabras con contenido del mensaje configurado: si al menos dos
    // aparecen, el incentivo se dijo. Una sola coincidencia es casualidad.
    const words = normalize(message)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 3);
    const hits = words.filter((word) => text.includes(word));
    return words.length > 0 && hits.length >= Math.min(2, words.length);
  }

  return false;
}
