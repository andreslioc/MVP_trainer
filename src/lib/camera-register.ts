/**
 * Registro de camara: lo que la asesora puede leer al aire.
 *
 * La ficha tiene dos lectores con necesidades opuestas —la clienta que escucha
 * en un live y la asesora que estudia— y un solo juego de campos. Sin una regla
 * explicita, el campo del fundamento se llena de farmacologia y la asesora
 * termina leyendo "concentracion minima inhibitoria" en camara.
 *
 * La regla: `claim` y `science_note` van en el idioma de la clienta;
 * `technical_note` es donde vive el respaldo con nombres, estudios y PMID, y no
 * se dice al aire. Un termino tecnico solo entra a un campo de camara si viene
 * traducido en la misma frase —"el carvacrol, el compuesto estrella del
 * oregano"—; el listado de abajo son los que no sobreviven ni traducidos.
 */

/**
 * Marcadores de jerga cientifica. Se comparan sin tildes y en minusculas contra
 * el texto normalizado, asi que se escriben en su forma mas simple.
 *
 * La lista es corta a proposito: no busca ser un diccionario de terminos
 * dificiles, sino atrapar la escritura de paper. "Carvacrol" o "antioxidante"
 * no estan y no deben estar: son palabras que venden y que una clienta entiende
 * cuando van acompañadas.
 */
export const CAMERA_JARGON = [
  "in vitro",
  "in vivo",
  "concentracion minima inhibitoria",
  "metanalisis",
  "meta-analisis",
  "revision sistematica",
  "grade",
  "pmid",
  "doi:",
  "p-cimeno",
  "terpineno",
  "preclinic",
  "doble ciego",
  "placebo",
  "estadisticamente significativo",
  "biodisponibilidad",
  "farmacocinetic",
  // Palabras de etiqueta y de farmacia: correctas y nadie las dice en una
  // tienda. "Aceite de oliva como vehiculo" salio al aire tal cual.
  "vehiculo",
  "excipiente",
  "principio activo",
  "via topica",
  "via oral",
  "equivalencia herbal",
] as const;

/**
 * Tope duro de la frase que sale por la boca. Doce palabras es el objetivo y lo
 * que el formulario señala; dieciseis es el limite que impide que este campo se
 * convierta en un parrafo, que es como se degrada en la practica.
 */
export const CLAIM_MAX_WORDS = 16;
export const CLAIM_TARGET_WORDS = 12;

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es").trim();
}

export function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Devuelve el primer marcador de jerga encontrado, o `null` si el texto se
 * puede decir en camara. Se devuelve el termino y no un booleano porque el
 * error tiene que nombrar la palabra que hay que cambiar.
 */
export function findJargon(value: string): string | null {
  const text = normalize(value);
  return CAMERA_JARGON.find((term) => text.includes(normalize(term))) ?? null;
}
