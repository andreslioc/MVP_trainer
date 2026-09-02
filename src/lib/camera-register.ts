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
/**
 * Trazabilidad: de donde salio el dato.
 *
 * Es informacion valiosa —el equipo necesita saber si algo viene del panel de
 * la etiqueta o del material comercial— y no se dice en camara. El prompt toma
 * la ficha como texto literal, asi que una frase de trazabilidad escrita en un
 * campo que se dice sale por la boca de la asesora: "el fabricante lo presenta
 * como apoyo para una apariencia saludable" suena a que ella no se la juega.
 *
 * Su sitio es `technical_note`, el `reason` de la guia de cautela y los datos
 * sin confirmar. Nunca la descripcion, el para que sirve, la frase de un
 * beneficio, las frases del live ni la forma segura.
 *
 * NO se aplica a precauciones, casos de no uso, preguntas ni objeciones: ahi la
 * atribucion SUMA autoridad —"la etiqueta dice expresamente que no es para
 * embarazadas" es mas fuerte que decirlo sin fuente.
 */
export const PROVENANCE_MARKERS = [
  "el fabricante declara",
  "el fabricante indica",
  "el fabricante lo presenta",
  "el fabricante lo ofrece",
  "el fabricante lo describe",
  "el fabricante dice",
  "el fabricante afirma",
  "el fabricante no",
  "segun el fabricante",
  "declarado por el fabricante",
  "segun la etiqueta",
  "la etiqueta declara",
  "panel de la etiqueta",
  "material comercial",
  "la ficha registra",
  "la ficha contiene",
  "no se pudo confirmar",
  "pendiente de verificacion",
  "sin confirmar",
] as const;

export function findProvenance(value: string): string | null {
  const text = normalize(value);
  return PROVENANCE_MARKERS.find((marker) => text.includes(normalize(marker))) ?? null;
}

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
/**
 * Frases donde una palabra de la lista significa otra cosa y es correcta.
 *
 * "vehiculo" esta en la lista por el aceite portador de una capsula, y en
 * "conducir un vehiculo" significa carro: es espanol corriente y es justo lo que
 * hay que decir cuando una etiqueta advierte sobre manejar. Se recortan antes de
 * buscar, no despues, para que la palabra no llegue al comparador.
 *
 * Salio de una ficha con melatonina: el gate rechazaba la advertencia de no
 * conducir, que es la mas importante de ese producto.
 */
const JARGON_EXCEPTIONS = [
  "conducir un vehiculo",
  "conducir el vehiculo",
  "conducir vehiculos",
  "manejar un vehiculo",
  "manejar vehiculos",
  "vehiculo de motor",
] as const;

/**
 * Busca el termino como PALABRA, no como subcadena.
 *
 * Sin limites de palabra, "grade" —la escala de evidencia— se encontraba dentro
 * de "degrade" y rechazaba la frase "para que la fragancia no se degrade con la
 * luz". Es el mismo fallo que tenia el gate de alergenos con "trigo" dentro de
 * "Trigonella". Los limites se ponen solo en los extremos que son letra, para
 * que terminos como "doi:" sigan encontrandose.
 */
function containsTerm(text: string, term: string): boolean {
  const termino = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const inicio = /^[a-z0-9]/.test(term) ? "\\b" : "";
  const fin = /[a-z0-9]$/.test(term) ? "\\b" : "";
  return new RegExp(`${inicio}${termino}${fin}`).test(text);
}

export function findJargon(value: string): string | null {
  let text = normalize(value);
  for (const exception of JARGON_EXCEPTIONS) {
    text = text.split(normalize(exception)).join(" ");
  }
  return CAMERA_JARGON.find((term) => containsTerm(text, normalize(term))) ?? null;
}
