/**
 * Registro sanitario: no se afirma el que no se encontro.
 *
 * En Colombia, decir en un live que un suplemento importado tiene registro del
 * INVIMA cuando no lo tiene es inventar una aprobacion de una autoridad. Es de
 * los errores mas caros que puede cometer una asesora, y el mas facil de
 * cometer: la clienta pregunta "¿esto es legal?" y la respuesta comoda es si.
 *
 * El gate no exige que la ficha tenga registro —la mayoria del catalogo se
 * vende como importado y eso esta bien—. Exige que la ficha no lo AFIRME cuando
 * sus propios datos sin confirmar dicen que no aparece en el registro publico.
 * Una ficha en desacuerdo consigo misma es peor que una incompleta.
 */

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es");
}

const REGISTRY_TERMS = [
  "registro sanitario",
  "invima",
  "registro invima",
  "notificacion sanitaria",
];

/**
 * Marcas de negacion o de duda. Se buscan en la MISMA frase que el termino de
 * registro: "no aparece en el registro del INVIMA" y "tiene registro del
 * INVIMA" comparten las palabras y son afirmaciones opuestas, asi que partir
 * por frase es lo que separa una de otra.
 */
const NEGATION_MARKERS = [
  "no ",
  "sin ",
  "ningun",
  "ninguna",
  "tampoco",
  "no aparece",
  "no figura",
  "no se encontro",
  "no lo podemos",
  "no se puede afirmar",
  "no afirmar",
  "no afirmes",
  "no publicado",
  "no_publicado",
  "pendiente",
  "sin confirmar",
  "desconocido",
];

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;·])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Frases que AFIRMAN un registro: nombran el registro y no lo niegan.
 */
export function findRegistryClaims(text: string): string[] {
  return sentences(text).filter((sentence) => {
    const frase = normalize(sentence);
    if (!REGISTRY_TERMS.some((term) => frase.includes(term))) return false;
    return !NEGATION_MARKERS.some((marker) => frase.includes(marker));
  });
}

/**
 * Si los datos sin confirmar dicen que el registro NO aparece publicado.
 *
 * Es la mitad que convierte una afirmacion en contradiccion: sin este hallazgo,
 * una ficha que menciona el registro puede tenerlo de verdad y el gate no tiene
 * por que opinar.
 */
export function gapsDenyRegistry(gaps: readonly string[]): boolean {
  return gaps.some((gap) => {
    const frase = normalize(gap);
    if (!REGISTRY_TERMS.some((term) => frase.includes(term))) return false;
    return NEGATION_MARKERS.some((marker) => frase.includes(marker));
  });
}
