/**
 * Preguntas de un dato suelto: las que se contestan con el dato y nada mas.
 *
 * "Cuanto trae", "que sabor tiene", "de que material es". La clienta quiere un
 * numero o una palabra, y pegarle "escribenos al numero que ves en pantalla"
 * estorba la respuesta y suena a robot.
 *
 * Vive en codigo y no en el prompt porque el prompt ya trae una orden mas fuerte
 * —el proposito es vender— y con permiso para omitir el CTA el modelo lo seguia
 * pegando igual. Medido contra el proveedor, no supuesto: con la regla escrita
 * en el prompt, "cuanto trae" seguia cerrando con el CTA en las tres versiones.
 *
 * La clasificacion de intencion no sirve para esto: "cuanto trae" y "para que
 * sirve" caen las dos en `informacion`, y solo una de las dos abre camino a la
 * compra.
 */

const SINGLE_FACT_PATTERNS = [
  /\bcuant[oa]s?\s+(trae|viene|mide|pesa|dura|contiene|capsulas|c[aá]psulas|gotas|unidades|ml|mg|gramos|porciones|tabletas|sobres)\b/i,
  /\bque\s+(sabor|color|aroma|olor|material|tama[nñ]o|presentaci[oó]n|marca)\b/i,
  /\bde\s+que\s+(color|material|sabor|marca|tama[nñ]o)\b/i,
  /\bcual\s+es\s+el\s+(sabor|color|tama[nñ]o|peso|precio por)\b/i,
  /\bque\s+tama[nñ]o\b/i,
];

/** Sin tildes: una clienta escribe "cuantas" y "cuántas" con la misma intencion. */
function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

/**
 * `true` cuando la pregunta pide un dato y nada mas.
 *
 * El limite de palabras es parte de la regla: "cuanto trae" es un dato suelto,
 * pero "cuanto trae y me sirve si estoy tomando otra cosa" ya es una
 * conversacion, y ahi el CTA vuelve a tener sentido.
 */
export function asksSingleFact(question: string): boolean {
  const words = question.trim().split(/\s+/).filter(Boolean);
  if (words.length > 9) return false;
  const text = normalize(question);
  return SINGLE_FACT_PATTERNS.some((pattern) => pattern.test(text));
}
