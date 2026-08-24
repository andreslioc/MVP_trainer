/**
 * Fichas que una clienta nombraria con las mismas palabras.
 *
 * En el catalogo hay seis fichas con "magnesio" y nueve con "vitamina". "El
 * magnesio" no identifica ninguna, y una pregunta de practica que dice "el
 * magnesio" a secas entrena a la asesora a responder sobre un producto que no
 * sabe cual es. Cuando esta lista no esta vacia, la marca deja de ser adorno.
 */

export type NamedProduct = { id: string; name: string; brand: string };

/** Palabras que nombran un envase o una forma, no un producto. */
const genericWords = new Set([
  "suplemento",
  "capsulas",
  "capsula",
  "tabletas",
  "tableta",
  "gomitas",
  "frasco",
  "botella",
  "gotero",
  "sobres",
  "polvo",
  "liquido",
  "unidades",
  "count",
  "extra",
  "fuerte",
  "natural",
  "premium",
  "avanzado",
  "avanzada",
]);

function tokens(value: string) {
  return new Set(
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLocaleLowerCase("es")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 5 && !genericWords.has(word)),
  );
}

/**
 * Las palabras con que se pide el producto: las del nombre, menos las de la
 * marca. Sin quitar la marca, dos productos distintos de Piping Rock se verian
 * parecidos solo por decir "Piping".
 */
function requestWords(product: NamedProduct) {
  const brand = tokens(product.brand);
  return new Set([...tokens(product.name)].filter((word) => !brand.has(word)));
}

export function findSimilarProducts(
  product: NamedProduct,
  catalog: NamedProduct[],
  limit = 5,
): Array<{ name: string; brand: string }> {
  const words = requestWords(product);
  if (words.size === 0) return [];
  return catalog
    .filter((candidate) => candidate.id !== product.id)
    .filter((candidate) => {
      const other = requestWords(candidate);
      return [...words].some((word) => other.has(word));
    })
    .slice(0, limit)
    .map((candidate) => ({ name: candidate.name, brand: candidate.brand }));
}
