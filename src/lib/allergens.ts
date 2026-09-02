/**
 * Alergenos presentes en la formula: se dicen, y se dicen dos veces.
 *
 * Un extracto liquido de oregano que en realidad es oregano MAS aceite de oliva
 * salio de la tuberia con un solo ingrediente listado, sin una palabra sobre el
 * olivo en toda la ficha. La regla ya estaba escrita en el prompt —tres veces,
 * con "aceite de oliva" nombrado como ejemplo— y el modelo la perdio igual. Por
 * eso esto es un gate: el prompt baja la frecuencia, el gate garantiza el
 * limite.
 *
 * La comprobacion no es que el alergeno este en la lista de ingredientes: es
 * que llegue a precauciones y a casos de no uso. Nadie lee la lista de
 * ingredientes en camara, y quien pregunta "soy alergica a X" necesita que la
 * respuesta ya este escrita.
 */

/**
 * Cada alergeno con las formas en las que de verdad aparece escrito. La primera
 * es la que se le nombra a quien escribe la ficha; el resto son sinonimos que
 * cuentan como cobertura, porque una ficha que advierte del "olivo" ya cubrio el
 * "aceite de oliva".
 *
 * La lista es corta a proposito: son los alergenos frecuentes de etiquetado, no
 * un catalogo de sensibilidades posibles. Alargarla convierte el gate en ruido.
 */
export const FREQUENT_ALLERGENS = [
  { label: "aceite de oliva", forms: ["aceite de oliva", "oliva", "olivo", "aceituna"] },
  { label: "soya", forms: ["soya", "soja", "lecitina de soya"] },
  { label: "leche", forms: ["leche", "lacteo", "lactosa", "suero de leche", "caseina", "whey"] },
  { label: "gluten", forms: ["gluten", "trigo", "cebada", "centeno", "avena"] },
  { label: "huevo", forms: ["huevo", "albumina de huevo", "ovoalbumina"] },
  { label: "pescado", forms: ["pescado", "aceite de pescado", "bacalao", "salmon", "anchoa"] },
  { label: "mariscos", forms: ["marisco", "crustaceo", "camaron", "cangrejo", "krill", "molusco"] },
  {
    label: "frutos secos",
    forms: [
      "fruto seco",
      "frutos secos",
      "almendra",
      "nuez",
      "nueces",
      "marañon",
      "avellana",
      "pistacho",
    ],
  },
  { label: "mani", forms: ["mani", "cacahuate", "cacahuete", "arachis"] },
  { label: "sesamo", forms: ["sesamo", "ajonjoli", "tahini"] },
  {
    label: "gelatina de origen animal",
    forms: ["gelatina bovina", "gelatina porcina", "gelatina de res", "gelatina de cerdo"],
  },
  // Es uno de los alergenos de CONTACTO mas frecuentes, y llega por los
  // topicos —ungüentos de pañalitis, balsamos, cremas de manos—, no por lo
  // que se ingiere. Entro a la lista despues de manejarla a mano en cuatro
  // fichas seguidas. "alcoholes de lanolina" queda cubierto por "lanolina".
  { label: "lanolina", forms: ["lanolina", "lanolin"] },
  { label: "colorantes", forms: ["tartrazina", "amarillo 5", "rojo 40", "carmin"] },
] as const;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

/**
 * Contextos que niegan la presencia del alergeno o lo nombran por otra razon.
 *
 * Se buscan pegados justo antes de la coincidencia, no en toda la frase: "sin
 * gluten" y "libre de gluten" son atributos de venta, no advertencias, y "en
 * contacto con la leche" describe las piezas de un extractor de leche materna,
 * donde la leche no es un ingrediente. Los dos casos salieron de auditar el
 * catalogo con la primera version de este gate.
 */
const EXCLUDING_CONTEXTS =
  /(?:sin|libre de|libres de|no contiene|exento de|exenta de|en contacto con|apto para|aptos para)\s+(?:la\s+|el\s+|los\s+|las\s+)?$/;

/**
 * Busca el termino como PALABRA, no como subcadena, y descarta la coincidencia
 * que venga negada por su contexto.
 *
 * El limite de palabra no es un detalle: "Trigonella foenum-graecum" —el nombre
 * botanico del fenogreco— contiene "trigo", y sin limites el gate acusaba de
 * gluten a un te de hierbas.
 */
function mentionsTerm(text: string, term: string): boolean {
  const termino = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patron = new RegExp(`\\b${termino}\\b`, "g");
  for (const match of text.matchAll(patron)) {
    const antes = text.slice(Math.max(0, (match.index ?? 0) - 24), match.index ?? 0);
    if (!EXCLUDING_CONTEXTS.test(antes)) return true;
  }
  return false;
}

/**
 * Alergenos frecuentes presentes en los nombres de los ingredientes.
 *
 * Devuelve la etiqueta canonica y una sola vez cada uno: un ingrediente que
 * dice "aceite de oliva virgen extra" y otro que dice "oliva" son el mismo
 * aviso para quien escucha.
 */
export function findAllergensInIngredients(ingredientNames: readonly string[]): string[] {
  const texto = normalize(ingredientNames.join(" · "));
  return FREQUENT_ALLERGENS.filter((allergen) =>
    allergen.forms.some((form) => mentionsTerm(texto, form)),
  ).map((allergen) => allergen.label);
}

/**
 * Si el alergeno quedo advertido en un texto. Cualquiera de sus formas cuenta:
 * lo que importa es que quien escuche pueda decidir, no que se use la palabra
 * exacta de la lista.
 */
export function mentionsAllergen(label: string, text: string): boolean {
  const allergen = FREQUENT_ALLERGENS.find((item) => item.label === label);
  if (!allergen) return false;
  const texto = normalize(text);
  return allergen.forms.some((form) => mentionsTerm(texto, form));
}
