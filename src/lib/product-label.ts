/**
 * Como se nombra una ficha donde solo cabe un renglon.
 *
 * Existe porque el nombre viaja SOLO a tres lugares que no muestran la tarjeta:
 * el selector del Copilot, el del Training y el catalogo que recibe el
 * analizador de transcripciones. Ahi dos empaques del mismo producto —150 y 250
 * capsulas— eran literalmente el mismo texto, y la asesora elegia a ciegas.
 *
 * La convencion de los nombres vive en CLAUDE.md; esto es su otra mitad: el
 * nombre distingue el PRODUCTO y la etiqueta agrega el EMPAQUE.
 */

/**
 * Palabras de envase que no distinguen nada.
 *
 * "Frasco con 150 cápsulas" y "Caja de 680 g" gastan el principio del renglon
 * en el recipiente. Lo que la asesora compara es la cifra, asi que el prefijo
 * se cae y la cifra queda primero.
 */
const ENVASE =
  /^(frasco|caja|envase|bolsa|pack|paquete|tarro|blister|sobre|unidad individual|set)\b[\s]*(con|de|por|en polvo de|que incluye)?\s*/i;

/**
 * Tope del trozo de presentacion en un renglon.
 *
 * Algunas presentaciones son una frase entera —"Kit que incluye biberón de 270
 * mL (9 oz), tetina Nivel 3, boquilla de transición…"— y dejaban etiquetas de
 * 187 caracteres, que en un `<select>` se cortan donde el navegador quiera. El
 * detalle completo vive en la tarjeta; aca solo tiene que DISCRIMINAR.
 */
const TOPE = 44;

/** La presentacion recortada a lo que de verdad diferencia. */
export function shortenPresentation(presentation: string) {
  const limpio = presentation.trim().replace(ENVASE, "");
  // Se corta en el primer separador fuerte: lo que sigue a un "·" o a un "("
  // suele ser una nota, no la cifra.
  const corte = (limpio.split(" · ")[0]?.trim() ?? limpio) || presentation.trim();
  if (corte.length <= TOPE) return corte;
  // Se corta en el ultimo espacio para no partir una palabra ni una cifra.
  const recorte = corte.slice(0, TOPE);
  const espacio = recorte.lastIndexOf(" ");
  return `${(espacio > TOPE / 2 ? recorte.slice(0, espacio) : recorte).trimEnd()}…`;
}

/**
 * Compara dos textos sin acentos, sin ® y sin puntuacion.
 *
 * Se usa para no repetir el empaque cuando el nombre YA lo trae: la regla de
 * nombres unicos mete `· 150 cápsulas` en el nombre de los hermanos, y sumarle
 * "(150 cápsulas blandas)" al lado lo diria dos veces.
 */
function plano(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * La CIFRA que discrimina: el primer numero con su unidad.
 *
 * Se compara por la cifra y no por la cadena entera porque nunca coinciden
 * palabra por palabra: el nombre dice `· 150 cápsulas` y la presentacion dice
 * "150 cápsulas blandas", o el nombre dice `· 16 oz` y la presentacion
 * "16 oz (453 g)". Comparando el texto completo, la etiqueta repetia la cifra.
 */
const CIFRA =
  /\b(\d+(?: \d{3})*(?:[.,]\d+)?)\s*(caps?ulas?|gomitas?|tabletas?|capletas?|sobres?|latas?|unidades?|fl oz|oz|mililitros?|ml|litros?|l|gramos?|gr|g|kg|mg|mcg)\b/g;

/**
 * La misma unidad escrita de dos formas es la misma unidad: el nombre dice
 * "264 g" y la presentacion "264 gramos". Sin esto la etiqueta repetia la cifra.
 */
const SINONIMOS: Record<string, string> = {
  gramos: "g",
  gramo: "g",
  gr: "g",
  litros: "l",
  litro: "l",
  mililitros: "ml",
  mililitro: "ml",
  capsula: "capsulas",
  capsulas: "capsulas",
  capsulass: "capsulas",
  gomita: "gomitas",
  tableta: "tabletas",
  capleta: "capletas",
  sobre: "sobres",
  lata: "latas",
  unidad: "unidades",
  onza: "oz",
  onzas: "oz",
};

function cifras(valor: string) {
  return [...plano(valor).matchAll(CIFRA)].map((m) => {
    const unidad = m[2] ?? "";
    return `${m[1]} ${SINONIMOS[unidad] ?? unidad}`;
  });
}

export type LabeledProduct = {
  name: string;
  /**
   * El nombre en español, vacio cuando no aporta.
   *
   * Va en el renglon del selector y no solo en la tarjeta porque el selector es
   * donde se ELIGE, con la camara encendida: si la asesora no conoce el nombre
   * en ingles, es justo ahi donde le hace falta.
   */
  nameEs?: string;
  brand: string;
  presentation: string;
};

/**
 * El renglon de un `<option>`: que es, de quien, y en que empaque.
 *
 * La marca va despues del nombre y no antes porque la asesora busca por
 * producto: con la marca de primera, cinco referencias de Kirkland empiezan
 * igual y la parte que distingue se sale del ancho del selector.
 */
export function productOptionLabel({ name, nameEs, brand, presentation }: LabeledProduct) {
  const corta = shortenPresentation(presentation);
  // TODAS las cifras del nombre, no la primera: "Oil of Oregano 4000 mg · 150
  // cápsulas" tiene dos, y la que discrimina es la segunda.
  const delNombre = new Set(cifras(name));
  const yaLoDice =
    plano(name).includes(plano(corta)) || cifras(corta).some((c) => delNombre.has(c));
  // El español va pegado al nombre del rotulo, antes de la marca: es la
  // traduccion DE ese nombre, y con la marca en medio se desemparejarian.
  const partes = [nameEs?.trim() ? `${name} — ${nameEs.trim()}` : name, brand];
  if (!yaLoDice) partes.push(corta);
  return partes.join(" · ");
}
